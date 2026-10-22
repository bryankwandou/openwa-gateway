import type { IncomingMessage, ServerResponse } from 'node:http';
import { EngineFactory } from '../src/core/engine/engine-factory.ts';
import { INITIAL_LID_MAPPINGS, LidMappingStore } from '../src/core/identity/lid-mapping-store.ts';
import { normalizeWaId, toEngineDialect } from '../src/core/identity/wa-id.ts';
import { UPSTREAM_PROTOCOL_PATCHES } from '../src/core/patches/upstream-patches.ts';
import { evaluateHttpEdgeGuards } from '../src/core/security/http-guards.ts';
import { executeMcpToolCall, OPENWA_MCP_TOOLS } from '../src/core/mcp/mcp-registry.ts';

const lidStore = new LidMappingStore(INITIAL_LID_MAPPINGS);
const engineFactory = new EngineFactory({ engineType: 'baileys', lidStore });

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  const method = req.method ?? 'GET';
  const originalUrl = req.url ?? '/api/v1/health';
  const contentEncoding = String(req.headers['content-encoding'] ?? 'identity');
  const contentLengthBytes = Number.parseInt(String(req.headers['content-length'] ?? '0'), 10) || 0;
  const apiKeyHeader = String(req.headers['x-api-key'] ?? req.headers['authorization'] ?? '');

  const guard = evaluateHttpEdgeGuards({
    method,
    originalUrl,
    contentEncoding,
    contentLengthBytes,
    recognizedApiKey: apiKeyHeader.length > 0,
    currentTotalInflightBytes: 0,
    currentUnrecognizedInflightBytes: 0,
  });

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (!guard.allowed) {
    res.statusCode = guard.statusCode;
    res.end(
      JSON.stringify({
        statusCode: guard.statusCode,
        error: guard.error,
        message: guard.message,
      }),
    );
    return;
  }

  const parsedUrl = new URL(originalUrl, 'http://localhost');
  const pathname = parsedUrl.pathname.toLowerCase();

  if (pathname === '/api/v1/engines' || pathname === '/api/engines') {
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        activeEngine: engineFactory.getCurrentEngine(),
        engines: engineFactory.getAvailableEngines(),
      }),
    );
    return;
  }

  if (pathname === '/api/v1/identity/resolve' || pathname === '/api/identity/resolve') {
    const rawId = parsedUrl.searchParams.get('id') ?? '198472910384712:14@lid';
    const sessionId = parsedUrl.searchParams.get('sessionId') ?? 'sess-baileys-primary-01';
    try {
      const resolver = (lid: string) => lidStore.resolveLidToPhone(sessionId, lid);
      const parsed = normalizeWaId(rawId, resolver);
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          sessionId,
          raw: rawId,
          neutralId: parsed.neutralId,
          kind: parsed.kind,
          resolvedViaLidStore: parsed.resolvedViaLidStore,
          baileysDialect: toEngineDialect(rawId, 'baileys', resolver),
          wwebjsDialect: toEngineDialect(rawId, 'whatsapp-web.js', resolver),
        }),
      );
    } catch (err) {
      res.statusCode = 400;
      res.end(
        JSON.stringify({
          statusCode: 400,
          error: 'Bad Request',
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    }
    return;
  }

  if (pathname === '/api/v1/patches' || pathname === '/api/patches') {
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        totalPatches: UPSTREAM_PROTOCOL_PATCHES.length,
        patches: UPSTREAM_PROTOCOL_PATCHES,
      }),
    );
    return;
  }

  if (pathname === '/mcp' || pathname.startsWith('/api/mcp')) {
    const toolName = parsedUrl.searchParams.get('tool') ?? 'openwa_list_sessions';
    const result = executeMcpToolCall(
      toolName,
      {
        sessionId: parsedUrl.searchParams.get('sessionId') ?? 'sess-baileys-primary-01',
        identifier: parsedUrl.searchParams.get('id') ?? '198472910384712:14@lid',
      },
      {
        authenticated: true,
        engineFactory,
        lidStore,
      },
    );
    res.statusCode = result.isError ? 400 : 200;
    res.end(
      JSON.stringify({
        server: { name: 'openwa', version: '0.25.0' },
        availableTools: OPENWA_MCP_TOOLS,
        execution: result,
      }),
    );
    return;
  }

  res.statusCode = 200;
  res.end(
    JSON.stringify({
      status: 'ok',
      service: 'openwa-gateway',
      version: '0.25.0',
      reconstructedFrom: 'rmyndharis/OpenWA',
      reaPolicyVersion: 44,
      activeEngine: engineFactory.getCurrentEngine(),
      endpoints: [
        '/api/v1/health',
        '/api/v1/engines',
        '/api/v1/identity/resolve?id=198472910384712:14@lid',
        '/api/v1/patches',
        '/mcp?tool=openwa_list_sessions',
      ],
    }),
  );
}
