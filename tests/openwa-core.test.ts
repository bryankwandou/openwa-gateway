import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeWaId, toEngineDialect } from '../src/core/identity/wa-id.ts';
import { INITIAL_LID_MAPPINGS, LidMappingStore } from '../src/core/identity/lid-mapping-store.ts';
import {
  EngineFactory,
  evaluateSessionTakeover,
  isSafeSessionName,
} from '../src/core/engine/engine-factory.ts';
import { EngineStatus } from '../src/core/engine/whatsapp-engine.interface.ts';
import {
  sanitizePostinstallEnv,
  UPSTREAM_PROTOCOL_PATCHES,
  verifyUpstreamPatchTarget,
} from '../src/core/patches/upstream-patches.ts';
import {
  apiKeyAuthorizationFingerprint,
  hashApiKey,
  normalizeScopeList,
} from '../src/core/security/api-key-auth.ts';
import { evaluateHttpEdgeGuards } from '../src/core/security/http-guards.ts';
import { hashOperatorPin, verifyOperatorPin } from '../src/core/security/pin-lock.ts';
import { WebhookOutboxStore } from '../src/core/webhook/webhook-outbox.ts';
import { executeMcpToolCall } from '../src/core/mcp/mcp-registry.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('OpenWA Reconstructed Architecture & Security Suite', () => {
  it('1. matches Node.js crypto SHA-256 and HMAC-SHA256 for hashApiKey', () => {
    const rawKey = 'owa_live_98a7bc65d4e3f21098a7bc65';
    const pepper = 'prod_pepper_7f8e9d0c1b2a3f4e5d6c';

    const expectedSha = createHash('sha256').update(rawKey).digest('hex');
    const expectedHmac = createHmac('sha256', pepper).update(rawKey).digest('hex');

    assert.equal(hashApiKey(rawKey), expectedSha);
    assert.equal(hashApiKey(rawKey, pepper), expectedHmac);
  });

  it('2. normalizes scope lists and keeps authorization fingerprints invariant across usage updates', () => {
    assert.equal(normalizeScopeList(['']), null);
    assert.equal(normalizeScopeList(['  ', '']), null);
    assert.deepEqual(normalizeScopeList([' sess-b ', '', 'sess-a']), ['sess-b', 'sess-a']);

    const fp1 = apiKeyAuthorizationFingerprint({
      role: 'ADMIN',
      allowedIps: ['10.0.0.2', '10.0.0.1'],
      allowedSessions: ['sess-2', 'sess-1'],
      allowedChats: ['6281190283741:14@s.whatsapp.net'],
      expiresAt: '2026-12-31T00:00:00.000Z',
    });

    const fp2 = apiKeyAuthorizationFingerprint({
      role: 'ADMIN',
      allowedIps: ['10.0.0.1', '10.0.0.2'],
      allowedSessions: ['sess-1', 'sess-2'],
      allowedChats: ['6281190283741@c.us'],
      expiresAt: '2026-12-31T00:00:00.000Z',
    });

    assert.equal(fp1, fp2);
  });

  it('3. normalizes JID/WID/LID into neutral dialect and resolves mapped @lid via LidMappingStore', () => {
    const store = new LidMappingStore(INITIAL_LID_MAPPINGS);
    const resolver = (lid: string) => store.resolveLidToPhone('sess-baileys-primary-01', lid);

    const baileysRaw = normalizeWaId('6281190283741:19@s.whatsapp.net', resolver);
    assert.equal(baileysRaw.neutralId, '6281190283741@c.us');
    assert.equal(baileysRaw.kind, 'direct');

    const resolvedLid = normalizeWaId('198472910384712:14@lid', resolver);
    assert.equal(resolvedLid.neutralId, '6281190283741@c.us');
    assert.equal(resolvedLid.resolvedViaLidStore, true);
    assert.equal(toEngineDialect('198472910384712:14@lid', 'baileys', resolver), '6281190283741@s.whatsapp.net');
    assert.equal(toEngineDialect('198472910384712:14@lid', 'whatsapp-web.js', resolver), '6281190283741@c.us');

    const unknownLid = normalizeWaId('999999999999999:3@lid', resolver);
    assert.equal(unknownLid.neutralId, '999999999999999@lid');
    assert.equal(unknownLid.kind, 'lid');
    assert.equal(unknownLid.resolvedViaLidStore, false);
  });

  it('4. enforces session path safety, dual-engine credential purge, and multi-node lease takeover', () => {
    assert.equal(isSafeSessionName('sess-baileys-primary-01'), true);
    assert.equal(isSafeSessionName('../etc/passwd'), false);
    assert.equal(isSafeSessionName('sess/evil'), false);
    assert.equal(isSafeSessionName('sess\\evil'), false);
    assert.equal(isSafeSessionName('..'), false);

    const store = new LidMappingStore(INITIAL_LID_MAPPINGS);
    const factory = new EngineFactory({ engineType: 'baileys', lidStore: store });

    assert.throws(() => factory.create({ sessionId: '../escape', dbSessionId: '../escape' }));

    const purge = factory.purgeSessionData('sess-01', 'legacy-sales-session');
    assert.equal(purge.refusedUnsafeKey, false);
    assert.equal(purge.purgedDirectories.length, 4);

    const decisions = evaluateSessionTakeover(
      [
        {
          sessionId: 's1',
          holderNodeId: 'node-a',
          status: EngineStatus.READY,
          hasPhoneLinked: true,
          leaseExpiresAtMs: 1000,
          leaseTtlMs: 500,
        },
        {
          sessionId: 's2-qr',
          holderNodeId: 'node-a',
          status: EngineStatus.QR_READY,
          hasPhoneLinked: false,
          leaseExpiresAtMs: 1000,
          leaseTtlMs: 500,
        },
      ],
      'node-b',
      2500,
    );

    assert.equal(decisions[0].eligibleForAdoption, true);
    assert.equal(decisions[0].launchDelayMs, 0);
    assert.equal(decisions[1].eligibleForAdoption, false);
    assert.equal(decisions[1].markStrandedDisconnected, true);
  });

  it('5. verifies all 12 upstream protocol patches and strips npm_config_allow_scripts', () => {
    const sanitized = sanitizePostinstallEnv({
      PATH: '/usr/bin',
      npm_config_allow_scripts: 'true',
      NPM_CONFIG_ALLOW_SCRIPTS: 'true',
    });
    assert.equal('npm_config_allow_scripts' in sanitized, false);
    assert.equal('NPM_CONFIG_ALLOW_SCRIPTS' in sanitized, false);
    assert.equal(UPSTREAM_PROTOCOL_PATCHES.length, 12);

    for (const spec of UPSTREAM_PROTOCOL_PATCHES) {
      const okPatched = verifyUpstreamPatchTarget(spec, spec.patchedReplacement, true);
      assert.equal(okPatched.state, 'patched');
      assert.equal(okPatched.exitCode, 0);

      const okPristine = verifyUpstreamPatchTarget(spec, spec.unpatchedPattern, true);
      assert.equal(okPristine.state, 'unpatched-pristine');
      assert.equal(okPristine.exitCode, 0);

      const fatalCorrupted = verifyUpstreamPatchTarget(spec, 'drifted_code()', true);
      assert.equal(fatalCorrupted.state, 'half-patched-fatal');
      assert.equal(fatalCorrupted.exitCode, 1);
    }
  });

  it('6. enforces pre-parser HTTP surface guards (%00 NUL, trailing-slash DELETE, inflate:false, quarter budget)', () => {
    const nulRes = evaluateHttpEdgeGuards({
      method: 'GET',
      originalUrl: '/api/v1/sessions/abc%00def',
      contentLengthBytes: 0,
      recognizedApiKey: true,
      currentTotalInflightBytes: 0,
      currentUnrecognizedInflightBytes: 0,
    });
    assert.equal(nulRes.statusCode, 400);

    const delRes = evaluateHttpEdgeGuards({
      method: 'DELETE',
      originalUrl: '/api/v1/sessions/abc/',
      contentLengthBytes: 0,
      recognizedApiKey: true,
      currentTotalInflightBytes: 0,
      currentUnrecognizedInflightBytes: 0,
    });
    assert.equal(delRes.statusCode, 404);

    const ingressDelRes = evaluateHttpEdgeGuards({
      method: 'DELETE',
      originalUrl: '/api/ingress/provider-hook/',
      contentLengthBytes: 0,
      recognizedApiKey: false,
      currentTotalInflightBytes: 0,
      currentUnrecognizedInflightBytes: 0,
    });
    assert.equal(ingressDelRes.statusCode, 200);

    const gzipRes = evaluateHttpEdgeGuards({
      method: 'POST',
      originalUrl: '/api/v1/messages',
      contentEncoding: 'gzip',
      contentLengthBytes: 128,
      recognizedApiKey: true,
      currentTotalInflightBytes: 0,
      currentUnrecognizedInflightBytes: 0,
    });
    assert.equal(gzipRes.statusCode, 415);

    const quarterExhausted = evaluateHttpEdgeGuards({
      method: 'POST',
      originalUrl: '/api/v1/messages',
      contentLengthBytes: 5 * 1024 * 1024,
      recognizedApiKey: false,
      currentTotalInflightBytes: 18 * 1024 * 1024,
      currentUnrecognizedInflightBytes: 18 * 1024 * 1024,
      maxBodyLimitBytes: 10 * 1024 * 1024,
      totalBudgetBytes: 50 * 1024 * 1024,
    });
    assert.equal(quarterExhausted.statusCode, 503);
  });

  it('7. deduplicates webhook outbox deliveries, verifies operator PINs, and executes MCP tools', () => {
    const pinHash = hashOperatorPin('278500');
    assert.equal(verifyOperatorPin('278500', pinHash), true);
    assert.equal(verifyOperatorPin('000000', pinHash), false);

    const outbox = new WebhookOutboxStore();
    const first = outbox.openDelivery({
      webhookId: 'wh_1',
      sessionId: 'sess-1',
      event: 'message.received',
      idempotencyKey: 'idem_1',
      deliveryId: 'dlv_1',
      secret: 'sec_1',
      payload: { ok: true },
      createdAt: '2026-10-01T00:00:00.000Z',
    });
    assert.equal(first.deduplicated, false);

    const duplicate = outbox.openDelivery({
      webhookId: 'wh_1',
      sessionId: 'sess-1',
      event: 'message.received',
      idempotencyKey: 'idem_1',
      deliveryId: 'dlv_2',
      secret: 'sec_1',
      payload: { ok: true },
    });
    assert.equal(duplicate.deduplicated, true);
    assert.equal(duplicate.record.deliveryId, 'dlv_1');

    // Pending rows are never pruned even when old
    assert.equal(outbox.pruneSettled(7, Date.parse('2026-10-22T00:00:00.000Z')), 0);
    outbox.markState('wh_1', 'idem_1', 'delivered');
    assert.equal(outbox.pruneSettled(7, Date.parse('2026-10-22T00:00:00.000Z')), 1);

    const store = new LidMappingStore(INITIAL_LID_MAPPINGS);
    const factory = new EngineFactory({ engineType: 'baileys', lidStore: store });
    const unauthMcp = executeMcpToolCall('openwa_list_sessions', {}, { authenticated: false, engineFactory: factory, lidStore: store });
    assert.equal(unauthMcp.isError, true);
    assert.equal(unauthMcp.auditAction, 'API_KEY_AUTH_FAILED');

    const authMcp = executeMcpToolCall('openwa_list_sessions', {}, { authenticated: true, engineFactory: factory, lidStore: store });
    assert.equal(authMcp.isError, false);
  });

  it('8. maintains 100% localization key parity between id.json and en.json', () => {
    const idJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'locales', 'id.json'), 'utf8'));
    const enJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'locales', 'en.json'), 'utf8'));

    const idKeys = Object.keys(idJson).sort();
    const enKeys = Object.keys(enJson).sort();
    assert.deepEqual(idKeys, enKeys);
  });
});
