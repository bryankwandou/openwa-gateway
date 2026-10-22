import React, { useState } from 'react';
import { ArrowRightLeft, Database, Fingerprint } from 'lucide-react';
import { useAppPreferences } from '../context/AppPreferencesContext.tsx';
import { normalizeWaId, toEngineDialect } from '../core/identity/wa-id.ts';
import type { LidMappingRecord, LidMappingStore } from '../core/identity/lid-mapping-store.ts';

interface IdentityInspectorProps {
  lidStore: LidMappingStore;
  onMappingsUpdated: () => void;
}

export const IdentityInspector: React.FC<IdentityInspectorProps> = ({ lidStore, onMappingsUpdated }) => {
  const { t } = useAppPreferences();
  const [sessionId] = useState('sess-baileys-primary-01');
  const [rawJidInput, setRawJidInput] = useState('198472910384712:14@lid');
  const [lidInput, setLidInput] = useState('551928374651920@lid');
  const [phoneInput, setPhoneInput] = useState('6281399887766@c.us');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [records, setRecords] = useState<LidMappingRecord[]>(() => lidStore.listBySession());

  const resolver = (lid: string) => lidStore.resolveLidToPhone(sessionId, lid);

  let parsedResult: {
    neutralId: string;
    kind: string;
    baileysWire: string;
    wwebjsWire: string;
    resolvedViaLidStore: boolean;
  } | null = null;

  try {
    const parsed = normalizeWaId(rawJidInput, resolver);
    parsedResult = {
      neutralId: parsed.neutralId,
      kind: parsed.kind,
      baileysWire: toEngineDialect(rawJidInput, 'baileys', resolver),
      wwebjsWire: toEngineDialect(rawJidInput, 'whatsapp-web.js', resolver),
      resolvedViaLidStore: parsed.resolvedViaLidStore,
    };
  } catch {
    parsedResult = null;
  }

  const handleUpsert = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setErrorMsg(null);
      lidStore.upsertMapping(sessionId, lidInput, phoneInput, 'manual-operator');
      setRecords([...lidStore.listBySession()]);
      onMappingsUpdated();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="panel-grid">
      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('identity_panel_title')}</h2>
            <p className="panel-subtitle">{t('identity_panel_subtitle')}</p>
          </div>
          <span className="badge">
            <Fingerprint size={14} aria-hidden="true" />
            <span>wa-id.ts</span>
          </span>
        </div>

        <div className="form-field">
          <label htmlFor="raw-jid-input" className="form-label">
            {t('raw_jid_input_label')}
          </label>
          <input
            id="raw-jid-input"
            className="input-control"
            value={rawJidInput}
            onChange={e => setRawJidInput(e.target.value)}
          />
        </div>

        <div className="hero-actions">
          <button
            type="button"
            className="btn"
            onClick={() => setRawJidInput('198472910384712:14@lid')}
          >
            198472910384712:14@lid
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setRawJidInput('6281190283741:22@s.whatsapp.net')}
          >
            6281190283741:22@s.whatsapp.net
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setRawJidInput('12036304918273@g.us')}
          >
            12036304918273@g.us
          </button>
        </div>

        {parsedResult ? (
          <div className="telemetry-grid">
            <div className="telemetry-box">
              <div className="telemetry-label">{t('resolved_neutral_label')}</div>
              <div className="telemetry-value">{parsedResult.neutralId}</div>
            </div>
            <div className="telemetry-box">
              <div className="telemetry-label">{t('resolved_kind_label')}</div>
              <div className="telemetry-value">
                {parsedResult.kind} {parsedResult.resolvedViaLidStore ? '(LID Resolved)' : ''}
              </div>
            </div>
            <div className="telemetry-box">
              <div className="telemetry-label">{t('resolved_baileys_label')}</div>
              <div className="telemetry-value">{parsedResult.baileysWire}</div>
            </div>
            <div className="telemetry-box">
              <div className="telemetry-label">{t('resolved_wwebjs_label')}</div>
              <div className="telemetry-value">{parsedResult.wwebjsWire}</div>
            </div>
          </div>
        ) : (
          <div className="badge badge-error">Invalid JID/WID syntax</div>
        )}
      </div>

      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('lid_store_title')}</h2>
            <p className="panel-subtitle">{t('lid_store_subtitle')}</p>
          </div>
          <span className="badge">
            <Database size={14} aria-hidden="true" />
            <span>{records.length} rows</span>
          </span>
        </div>

        <form onSubmit={handleUpsert} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div className="form-field">
            <label htmlFor="lid-key-input" className="form-label">
              {t('lid_input_label')}
            </label>
            <input
              id="lid-key-input"
              className="input-control"
              value={lidInput}
              onChange={e => setLidInput(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="phone-wid-input" className="form-label">
              {t('phone_input_label')}
            </label>
            <input
              id="phone-wid-input"
              className="input-control"
              value={phoneInput}
              onChange={e => setPhoneInput(e.target.value)}
            />
          </div>

          {errorMsg && <div className="badge badge-error">{errorMsg}</div>}

          <button type="submit" className="btn btn-primary" aria-label={t('btn_upsert_lid')}>
            <ArrowRightLeft size={16} aria-hidden="true" />
            <span>{t('btn_upsert_lid')}</span>
          </button>
        </form>

        <table className="data-table">
          <thead>
            <tr>
              <th>{t('col_session')}</th>
              <th>{t('col_lid')}</th>
              <th>{t('col_phone_wid')}</th>
              <th>{t('col_source')}</th>
            </tr>
          </thead>
          <tbody>
            {records.map(rec => (
              <tr key={`${rec.sessionId}-${rec.lid}`}>
                <td className="mono">{rec.sessionId}</td>
                <td className="mono">{rec.lid}</td>
                <td className="mono">{rec.phoneWid}</td>
                <td>
                  <span className="badge">{rec.source}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
