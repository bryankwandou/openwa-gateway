import React, { useState } from 'react';
import { Key, Layers, ShieldAlert, Webhook } from 'lucide-react';
import { useAppPreferences } from '../context/AppPreferencesContext.tsx';
import {
  apiKeyAuthorizationFingerprint,
  hashApiKey,
  normalizeScopeList,
  type ApiKeyRole,
} from '../core/security/api-key-auth.ts';
import { evaluateHttpEdgeGuards } from '../core/security/http-guards.ts';
import { WebhookOutboxStore, type WebhookOutboxRecord } from '../core/webhook/webhook-outbox.ts';
import { executeMcpToolCall, OPENWA_MCP_TOOLS, type McpToolExecutionResult } from '../core/mcp/mcp-registry.ts';
import { EngineFactory } from '../core/engine/engine-factory.ts';
import type { LidMappingStore } from '../core/identity/lid-mapping-store.ts';

interface SecurityWebhookMcpPanelProps {
  lidStore: LidMappingStore;
}

const sharedOutbox = new WebhookOutboxStore();
sharedOutbox.openDelivery({
  webhookId: 'wh_prod_01',
  sessionId: 'sess-baileys-primary-01',
  event: 'message.received',
  idempotencyKey: 'idem_msg_0001',
  deliveryId: 'dlv_9821',
  secret: 'whsec_openwa_production_key',
  payload: {
    event: 'message.received',
    sessionId: 'sess-baileys-primary-01',
    from: '6281190283741@c.us',
    type: 'text',
  },
  createdAt: '2026-10-10T08:00:00.000Z',
});
sharedOutbox.markState('wh_prod_01', 'idem_msg_0001', 'delivered');

export const SecurityWebhookMcpPanel: React.FC<SecurityWebhookMcpPanelProps> = ({ lidStore }) => {
  const { t, requirePinConfirmation } = useAppPreferences();

  // 1. API Key Hash & Fingerprint state
  const [rawApiKey, setRawApiKey] = useState('owa_live_98a7bc65d4e3f21098a7bc65');
  const [pepper, setPepper] = useState('prod_pepper_7f8e9d0c1b2a3f4e5d6c');
  const [role, setRole] = useState<ApiKeyRole>('ADMIN');
  const [allowedSessionsStr, setAllowedSessionsStr] = useState('sess-baileys-primary-01, sess-wwebjs-fallback-02');
  const [allowedChatsStr, setAllowedChatsStr] = useState('6281190283741@s.whatsapp.net');

  // 2. Pre-Parser HTTP Edge Guard Simulator state
  const [httpMethod, setHttpMethod] = useState('POST');
  const [httpUrl, setHttpUrl] = useState('/api/v1/sessions/sess-baileys-primary-01/messages');
  const [httpEncoding, setHttpEncoding] = useState('identity');
  const [httpBytes, setHttpBytes] = useState(524288);
  const [recognizedKey, setRecognizedKey] = useState(true);

  // 3. Webhook Outbox & MCP Executor state
  const [webhookId, setWebhookId] = useState('wh_prod_01');
  const [idempotencyKey, setIdempotencyKey] = useState('idem_msg_0002');
  const [outboxRows, setOutboxRows] = useState<WebhookOutboxRecord[]>(() => sharedOutbox.listAll());
  const [lastDeduplicated, setLastDeduplicated] = useState<boolean | null>(null);
  const [selectedMcpTool, setSelectedMcpTool] = useState(OPENWA_MCP_TOOLS[1].name);
  const [mcpResult, setMcpResult] = useState<McpToolExecutionResult>(() => {
    const engineFactory = new EngineFactory({ engineType: 'baileys', lidStore });
    return executeMcpToolCall(
      'openwa_resolve_identity',
      {
        sessionId: 'sess-baileys-primary-01',
        identifier: '198472910384712:14@lid',
        targetEngine: 'baileys',
      },
      { authenticated: true, engineFactory, lidStore },
    );
  });

  const computedHash = hashApiKey(rawApiKey, pepper.trim() || undefined);
  const computedFingerprint = apiKeyAuthorizationFingerprint({
    role,
    allowedIps: null,
    allowedSessions: normalizeScopeList(allowedSessionsStr.split(',')),
    allowedChats: normalizeScopeList(allowedChatsStr.split(',')),
    expiresAt: null,
  });

  const guardOutcome = evaluateHttpEdgeGuards({
    method: httpMethod,
    originalUrl: httpUrl,
    contentEncoding: httpEncoding,
    contentLengthBytes: Number.isFinite(httpBytes) ? httpBytes : 0,
    recognizedApiKey: recognizedKey,
    currentTotalInflightBytes: 12 * 1024 * 1024,
    currentUnrecognizedInflightBytes: 18 * 1024 * 1024,
  });

  const handleRotateKey = () => {
    requirePinConfirmation(() => {
      const randomSuffix = Math.floor(10000000 + Math.random() * 90000000).toString(16);
      setRawApiKey(`owa_live_${randomSuffix}a9c4e1b2d3f0`);
    });
  };

  const handleEnqueueWebhook = (e: React.FormEvent) => {
    e.preventDefault();
    const res = sharedOutbox.openDelivery({
      webhookId: webhookId.trim(),
      sessionId: 'sess-baileys-primary-01',
      event: 'message.sent',
      idempotencyKey: idempotencyKey.trim(),
      deliveryId: `dlv_${Date.now().toString().slice(-4)}`,
      secret: 'whsec_openwa_production_key',
      payload: {
        event: 'message.sent',
        sessionId: 'sess-baileys-primary-01',
        idempotencyKey: idempotencyKey.trim(),
      },
    });
    setLastDeduplicated(res.deduplicated);
    setOutboxRows([...sharedOutbox.listAll()]);
  };

  const handlePruneOutbox = () => {
    sharedOutbox.pruneSettled(7);
    setOutboxRows([...sharedOutbox.listAll()]);
  };

  const handleInvokeMcp = () => {
    const engineFactory = new EngineFactory({ engineType: 'baileys', lidStore });
    const res = executeMcpToolCall(
      selectedMcpTool,
      {
        sessionId: 'sess-baileys-primary-01',
        identifier: '198472910384712:14@lid',
        to: '198472910384712@lid',
        text: 'Executed via MCP Streamable-HTTP tool registry',
        targetEngine: 'baileys',
      },
      { authenticated: true, engineFactory, lidStore },
    );
    setMcpResult(res);
  };

  return (
    <div className="panel-grid">
      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('security_auth_title')}</h2>
            <p className="panel-subtitle">{t('security_auth_subtitle')}</p>
          </div>
          <span className="badge">
            <Key size={14} aria-hidden="true" />
            <span>HMAC-SHA256</span>
          </span>
        </div>

        <div className="form-field">
          <label htmlFor="raw-api-key" className="form-label">
            {t('raw_api_key_label')}
          </label>
          <input
            id="raw-api-key"
            className="input-control"
            value={rawApiKey}
            onChange={e => setRawApiKey(e.target.value)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="api-key-pepper" className="form-label">
            {t('pepper_label')}
          </label>
          <input
            id="api-key-pepper"
            className="input-control"
            value={pepper}
            onChange={e => setPepper(e.target.value)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="api-key-role" className="form-label">
            {t('role_label')}
          </label>
          <select
            id="api-key-role"
            className="select-control"
            value={role}
            onChange={e => setRole(e.target.value as ApiKeyRole)}
          >
            <option value="ADMIN">ADMIN</option>
            <option value="OPERATOR">OPERATOR</option>
            <option value="READONLY">READONLY</option>
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="allowed-sessions-input" className="form-label">
            {t('allowed_sessions_label')}
          </label>
          <input
            id="allowed-sessions-input"
            className="input-control"
            value={allowedSessionsStr}
            onChange={e => setAllowedSessionsStr(e.target.value)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="allowed-chats-input" className="form-label">
            {t('allowed_chats_label')}
          </label>
          <input
            id="allowed-chats-input"
            className="input-control"
            value={allowedChatsStr}
            onChange={e => setAllowedChatsStr(e.target.value)}
          />
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleRotateKey}
          aria-label={t('btn_rotate_key')}
        >
          <Key size={16} aria-hidden="true" />
          <span>{t('btn_rotate_key')}</span>
        </button>

        <div>
          <div className="form-label" style={{ marginBottom: 'var(--space-1)' }}>
            {t('computed_hash_label')}
          </div>
          <div className="code-block">{computedHash}</div>
        </div>

        <div>
          <div className="form-label" style={{ marginBottom: 'var(--space-1)' }}>
            {t('computed_fp_label')}
          </div>
          <div className="code-block">{computedFingerprint}</div>
        </div>
      </div>

      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('guard_panel_title')}</h2>
            <p className="panel-subtitle">{t('guard_panel_subtitle')}</p>
          </div>
          <span className="badge">
            <ShieldAlert size={14} aria-hidden="true" />
            <span>HTTP {guardOutcome.statusCode}</span>
          </span>
        </div>

        <div className="form-field">
          <label htmlFor="http-method-select" className="form-label">
            {t('http_method_label')}
          </label>
          <select
            id="http-method-select"
            className="select-control"
            value={httpMethod}
            onChange={e => setHttpMethod(e.target.value)}
          >
            <option value="POST">POST</option>
            <option value="DELETE">DELETE</option>
            <option value="GET">GET</option>
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="http-url-input" className="form-label">
            {t('http_url_label')}
          </label>
          <input
            id="http-url-input"
            className="input-control"
            value={httpUrl}
            onChange={e => setHttpUrl(e.target.value)}
          />
        </div>

        <div className="hero-actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setHttpMethod('GET');
              setHttpUrl('/api/v1/sessions/sess%00inject');
            }}
          >
            Test %00 NUL (400)
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setHttpMethod('DELETE');
              setHttpUrl('/api/v1/sessions/child/../');
            }}
          >
            Test DELETE /api/.../ (404)
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setHttpMethod('POST');
              setHttpUrl('/api/v1/messages');
              setHttpEncoding('gzip');
            }}
          >
            Test gzip inflate:false (415)
          </button>
        </div>

        <div className="form-field">
          <label htmlFor="http-encoding-select" className="form-label">
            {t('http_encoding_label')}
          </label>
          <select
            id="http-encoding-select"
            className="select-control"
            value={httpEncoding}
            onChange={e => setHttpEncoding(e.target.value)}
          >
            <option value="identity">identity (uncompressed)</option>
            <option value="gzip">gzip (compressed)</option>
            <option value="br">br (Brotli)</option>
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="http-bytes-input" className="form-label">
            {t('http_bytes_label')}
          </label>
          <input
            id="http-bytes-input"
            type="number"
            className="input-control"
            value={httpBytes}
            onChange={e => setHttpBytes(Number(e.target.value))}
          />
        </div>

        <div className="form-field">
          <label htmlFor="http-key-status" className="form-label">
            {t('http_recognized_label')}
          </label>
          <select
            id="http-key-status"
            className="select-control"
            value={recognizedKey ? 'yes' : 'no'}
            onChange={e => setRecognizedKey(e.target.value === 'yes')}
          >
            <option value="yes">{t('http_key_recognized')}</option>
            <option value="no">{t('http_key_unrecognized')}</option>
          </select>
        </div>

        <pre className="code-block">{JSON.stringify(guardOutcome, null, 2)}</pre>
      </div>

      <div className="panel-card full-width">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('outbox_panel_title')}</h2>
            <p className="panel-subtitle">{t('outbox_panel_subtitle')}</p>
          </div>
          <span className="badge">
            <Webhook size={14} aria-hidden="true" />
            <span>Outbox + MCP (/mcp)</span>
          </span>
        </div>

        <div className="panel-grid">
          <form onSubmit={handleEnqueueWebhook} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div className="form-field">
              <label htmlFor="webhook-id-input" className="form-label">
                {t('webhook_id_label')}
              </label>
              <input
                id="webhook-id-input"
                className="input-control"
                value={webhookId}
                onChange={e => setWebhookId(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label htmlFor="idempotency-key-input" className="form-label">
                {t('idempotency_key_label')}
              </label>
              <input
                id="idempotency-key-input"
                className="input-control"
                value={idempotencyKey}
                onChange={e => setIdempotencyKey(e.target.value)}
              />
            </div>

            <div className="hero-actions">
              <button type="submit" className="btn btn-primary" aria-label={t('btn_enqueue_webhook')}>
                <Webhook size={16} aria-hidden="true" />
                <span>{t('btn_enqueue_webhook')}</span>
              </button>

              <button type="button" className="btn" onClick={handlePruneOutbox} aria-label={t('btn_prune_outbox')}>
                <span>{t('btn_prune_outbox')}</span>
              </button>
            </div>

            {lastDeduplicated !== null && (
              <div className={lastDeduplicated ? 'badge badge-warn' : 'badge'}>
                {lastDeduplicated
                  ? 'Idempotency conflict on (webhookId, idempotencyKey): existing row preserved without transaction rollback'
                  : 'New pending delivery row inserted via bare INSERT'}
              </div>
            )}

            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Webhook</th>
                  <th>Idempotency Key</th>
                  <th>State</th>
                  <th>HMAC-SHA256</th>
                </tr>
              </thead>
              <tbody>
                {outboxRows.map(row => (
                  <tr key={row.id}>
                    <td className="mono">{row.id}</td>
                    <td className="mono">{row.webhookId}</td>
                    <td className="mono">{row.idempotencyKey}</td>
                    <td>
                      <span className="badge">{row.state}</span>
                    </td>
                    <td className="mono">{row.signatureHmacSha256.slice(0, 22)}...</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </form>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div className="form-field">
              <label htmlFor="mcp-tool-select" className="form-label">
                {t('mcp_tool_select_label')}
              </label>
              <select
                id="mcp-tool-select"
                className="select-control"
                value={selectedMcpTool}
                onChange={e => setSelectedMcpTool(e.target.value)}
              >
                {OPENWA_MCP_TOOLS.map(tool => (
                  <option key={tool.name} value={tool.name}>
                    {tool.name} ({tool.requiredRole})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleInvokeMcp}
              aria-label={t('btn_invoke_mcp')}
            >
              <Layers size={16} aria-hidden="true" />
              <span>{t('btn_invoke_mcp')}</span>
            </button>

            <pre className="code-block">{JSON.stringify(mcpResult, null, 2)}</pre>
          </div>
        </div>
      </div>
    </div>
  );
};
