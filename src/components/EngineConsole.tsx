import React, { useState } from 'react';
import { Cpu, QrCode, Send, Trash2 } from 'lucide-react';
import { useAppPreferences } from '../context/AppPreferencesContext.tsx';
import {
  EngineFactory,
  evaluateSessionTakeover,
  type PurgeFootprintResult,
  type SessionLeaseCandidate,
} from '../core/engine/engine-factory.ts';
import { EngineStatus, type MessageResult } from '../core/engine/whatsapp-engine.interface.ts';
import type { LidMappingStore } from '../core/identity/lid-mapping-store.ts';
import type { SupportedEngineType } from '../core/identity/wa-id.ts';

interface EngineConsoleProps {
  lidStore: LidMappingStore;
}

const LEASE_CANDIDATES: SessionLeaseCandidate[] = [
  {
    sessionId: 'sess-baileys-primary-01',
    holderNodeId: 'replica-node-alpha',
    status: EngineStatus.READY,
    hasPhoneLinked: true,
    leaseExpiresAtMs: 100000,
    leaseTtlMs: 15000,
  },
  {
    sessionId: 'sess-wwebjs-fallback-02',
    holderNodeId: 'replica-node-alpha',
    status: EngineStatus.AUTHENTICATING,
    hasPhoneLinked: true,
    leaseExpiresAtMs: 95000,
    leaseTtlMs: 15000,
  },
  {
    sessionId: 'sess-unpaired-qr-03',
    holderNodeId: 'replica-node-alpha',
    status: EngineStatus.QR_READY,
    hasPhoneLinked: false,
    leaseExpiresAtMs: 80000,
    leaseTtlMs: 15000,
  },
  {
    sessionId: 'sess-local-active-04',
    holderNodeId: 'replica-node-beta',
    status: EngineStatus.READY,
    hasPhoneLinked: true,
    leaseExpiresAtMs: 160000,
    leaseTtlMs: 15000,
  },
];

export const EngineConsole: React.FC<EngineConsoleProps> = ({ lidStore }) => {
  const { t, requirePinConfirmation } = useAppPreferences();
  const [selectedEngine, setSelectedEngine] = useState<SupportedEngineType>('baileys');
  const [sessionId, setSessionId] = useState('sess-baileys-primary-01');
  const [recipient, setRecipient] = useState('198472910384712:14@lid');
  const [messageText, setMessageText] = useState('Verified message dispatch via OpenWA anti-corruption layer');
  const [quotedId, setQuotedId] = useState('BAE59012');
  const [dispatchOutput, setDispatchOutput] = useState<MessageResult | null>(() => {
    const factory = new EngineFactory({ engineType: 'baileys', lidStore });
    const eng = factory.create({ sessionId: 'sess-baileys-primary-01', dbSessionId: 'sess-baileys-primary-01' });
    return eng.sendTextMessage('198472910384712:14@lid', 'Verified message dispatch via OpenWA anti-corruption layer', {
      quotedMessageId: 'BAE59012',
    });
  });
  const [pairingCode, setPairingCode] = useState<string>('BLYS-3741');
  const [purgeResult, setPurgeResult] = useState<PurgeFootprintResult | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const factory = new EngineFactory({ engineType: selectedEngine, lidStore });
  const takeoverDecisions = evaluateSessionTakeover(LEASE_CANDIDATES, 'replica-node-beta', 135000);

  const handleDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setErrorBanner(null);
      const engine = factory.create({ sessionId, dbSessionId: sessionId });
      const res = engine.sendTextMessage(recipient, messageText, {
        quotedMessageId: quotedId.trim() || undefined,
      });
      setDispatchOutput(res);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    }
  };

  const handleGeneratePairing = () => {
    try {
      setErrorBanner(null);
      const engine = factory.create({ sessionId, dbSessionId: sessionId });
      const code = engine.requestPairingCode('6281190283741');
      setPairingCode(code);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    }
  };

  const handlePurgeSession = () => {
    requirePinConfirmation(() => {
      const result = factory.purgeSessionData(sessionId, `${sessionId}-legacy`);
      setPurgeResult(result);
    });
  };

  return (
    <div className="panel-grid">
      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('engine_panel_title')}</h2>
            <p className="panel-subtitle">{t('engine_panel_subtitle')}</p>
          </div>
          <span className="badge">
            <Cpu size={14} aria-hidden="true" />
            <span>{selectedEngine}</span>
          </span>
        </div>

        <form onSubmit={handleDispatch} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div className="form-field">
            <label htmlFor="engine-select" className="form-label">
              {t('engine_select_label')}
            </label>
            <select
              id="engine-select"
              className="select-control"
              value={selectedEngine}
              onChange={e => setSelectedEngine(e.target.value as SupportedEngineType)}
            >
              <option value="baileys">baileys (@whiskeysockets/baileys 7.0.0-rc14 — WebSocket Noise)</option>
              <option value="whatsapp-web.js">whatsapp-web.js (1.34.7 — Puppeteer 24.38.0 CDP)</option>
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="session-id-input" className="form-label">
              {t('session_id_label')}
            </label>
            <input
              id="session-id-input"
              className="input-control"
              value={sessionId}
              onChange={e => setSessionId(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="recipient-input" className="form-label">
              {t('recipient_label')}
            </label>
            <input
              id="recipient-input"
              className="input-control"
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="message-body-input" className="form-label">
              {t('message_body_label')}
            </label>
            <input
              id="message-body-input"
              className="input-control"
              value={messageText}
              onChange={e => setMessageText(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="quoted-id-input" className="form-label">
              {t('quoted_id_label')}
            </label>
            <input
              id="quoted-id-input"
              className="input-control"
              value={quotedId}
              onChange={e => setQuotedId(e.target.value)}
            />
          </div>

          {errorBanner && <div className="badge badge-error">{errorBanner}</div>}

          <div className="hero-actions">
            <button type="submit" className="btn btn-primary" aria-label={t('btn_send_message')}>
              <Send size={16} aria-hidden="true" />
              <span>{t('btn_send_message')}</span>
            </button>

            <button
              type="button"
              className="btn"
              onClick={handleGeneratePairing}
              aria-label={t('btn_generate_pairing')}
            >
              <QrCode size={16} aria-hidden="true" />
              <span>
                {t('btn_generate_pairing')}: {pairingCode}
              </span>
            </button>

            <button
              type="button"
              className="btn btn-danger"
              onClick={handlePurgeSession}
              aria-label={t('btn_purge_session')}
            >
              <Trash2 size={16} aria-hidden="true" />
              <span>{t('btn_purge_session')}</span>
            </button>
          </div>
        </form>

        {dispatchOutput && (
          <pre className="code-block">{JSON.stringify(dispatchOutput, null, 2)}</pre>
        )}

        {purgeResult && (
          <div>
            <div className="form-label" style={{ marginBottom: 'var(--space-1)' }}>
              {t('purge_result_title')}
            </div>
            <pre className="code-block">{JSON.stringify(purgeResult, null, 2)}</pre>
          </div>
        )}
      </div>

      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('takeover_panel_title')}</h2>
            <p className="panel-subtitle">{t('takeover_panel_subtitle')}</p>
          </div>
          <span className="badge">2000ms Stagger</span>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>{t('col_session')}</th>
              <th>{t('col_holder')}</th>
              <th>{t('col_status')}</th>
              <th>{t('col_decision')}</th>
              <th>{t('col_stagger')}</th>
            </tr>
          </thead>
          <tbody>
            {LEASE_CANDIDATES.map((cand, idx) => {
              const dec = takeoverDecisions[idx];
              return (
                <tr key={cand.sessionId}>
                  <td className="mono">{cand.sessionId}</td>
                  <td className="mono">{cand.holderNodeId}</td>
                  <td>
                    <span className={cand.status === EngineStatus.QR_READY ? 'badge badge-warn' : 'badge'}>
                      {cand.status}
                    </span>
                  </td>
                  <td>{dec.reason}</td>
                  <td className="mono">{dec.eligibleForAdoption ? `${dec.launchDelayMs}ms` : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
