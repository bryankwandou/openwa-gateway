import React, { useState } from 'react';
import { CheckCircle2, FileCode2, GitCommit } from 'lucide-react';
import { useAppPreferences, type TranslationKey } from '../context/AppPreferencesContext.tsx';
import {
  UPSTREAM_PROTOCOL_PATCHES,
  verifyUpstreamPatchTarget,
  type UpstreamPatchSpec,
} from '../core/patches/upstream-patches.ts';

type FilterScope = 'all' | 'whatsapp-web.js' | '@whiskeysockets/baileys';
type SimulationMode = 'patched' | 'pristine' | 'corrupted';

export const PatchPipelineViewer: React.FC = () => {
  const { t } = useAppPreferences();
  const [filterScope, setFilterScope] = useState<FilterScope>('all');
  const [simMode, setSimMode] = useState<SimulationMode>('patched');
  const [selectedPatch, setSelectedPatch] = useState<UpstreamPatchSpec>(UPSTREAM_PROTOCOL_PATCHES[0]);

  const filteredPatches = UPSTREAM_PROTOCOL_PATCHES.filter(p =>
    filterScope === 'all' ? true : p.targetLibrary === filterScope,
  );

  const buildSimulatedContent = (spec: UpstreamPatchSpec): string => {
    if (simMode === 'patched') return `// Patched module\n${spec.patchedReplacement}\n`;
    if (simMode === 'pristine') return `// Upstream pristine\n${spec.unpatchedPattern}\n`;
    return '// Corrupted half-patched module with drifted AST\nwindow.InvalidSymbol()';
  };

  return (
    <div className="panel-grid">
      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('patch_panel_title')}</h2>
            <p className="panel-subtitle">{t('patch_panel_subtitle')}</p>
          </div>
          <span className="badge">
            <GitCommit size={14} aria-hidden="true" />
            <span>postinstall.js</span>
          </span>
        </div>

        <div className="hero-actions">
          <button
            type="button"
            className={`btn ${filterScope === 'all' ? 'btn-primary' : ''}`}
            onClick={() => setFilterScope('all')}
          >
            {t('patch_filter_all')}
          </button>
          <button
            type="button"
            className={`btn ${filterScope === 'whatsapp-web.js' ? 'btn-primary' : ''}`}
            onClick={() => setFilterScope('whatsapp-web.js')}
          >
            {t('patch_filter_wwebjs')}
          </button>
          <button
            type="button"
            className={`btn ${filterScope === '@whiskeysockets/baileys' ? 'btn-primary' : ''}`}
            onClick={() => setFilterScope('@whiskeysockets/baileys')}
          >
            {t('patch_filter_baileys')}
          </button>
        </div>

        <div className="form-field">
          <label htmlFor="patch-sim-mode" className="form-label">
            {t('patch_test_mode_label')}
          </label>
          <select
            id="patch-sim-mode"
            className="select-control"
            value={simMode}
            onChange={e => setSimMode(e.target.value as SimulationMode)}
          >
            <option value="patched">{t('patch_mode_patched')}</option>
            <option value="pristine">{t('patch_mode_pristine')}</option>
            <option value="corrupted">{t('patch_mode_corrupted')}</option>
          </select>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Step</th>
              <th>Script</th>
              <th>Library</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredPatches.map(spec => {
              const verification = verifyUpstreamPatchTarget(spec, buildSimulatedContent(spec), true);
              return (
                <tr
                  key={spec.id}
                  onClick={() => setSelectedPatch(spec)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="mono">#{spec.stepOrder}</td>
                  <td className="mono">{spec.scriptPath.replace('scripts/', '')}</td>
                  <td className="mono">
                    {spec.targetLibrary}@{spec.targetVersion}
                  </td>
                  <td>
                    <span
                      className={
                        verification.exitCode === 0
                          ? verification.state === 'patched'
                            ? 'badge'
                            : 'badge badge-warn'
                          : 'badge badge-error'
                      }
                    >
                      {verification.state} (exit {verification.exitCode})
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t(selectedPatch.titleKey as TranslationKey)}</h2>
            <p className="panel-subtitle mono">
              {selectedPatch.scriptPath} | blob:{selectedPatch.blobSha1.slice(0, 12)}
            </p>
          </div>
          <span className="badge">
            <FileCode2 size={14} aria-hidden="true" />
            <span>Step #{selectedPatch.stepOrder}</span>
          </span>
        </div>

        <div>
          <div className="form-label" style={{ marginBottom: 'var(--space-1)' }}>
            Target File
          </div>
          <div className="code-block">{selectedPatch.targetFile}</div>
        </div>

        <div>
          <div className="form-label" style={{ marginBottom: 'var(--space-1)' }}>
            {t('patch_root_cause')}
          </div>
          <p>{selectedPatch.rootCause}</p>
        </div>

        <div>
          <div className="form-label" style={{ marginBottom: 'var(--space-1)' }}>
            {t('patch_unpatched_sig')}
          </div>
          <pre className="code-block">- {selectedPatch.unpatchedPattern}</pre>
        </div>

        <div>
          <div className="form-label" style={{ marginBottom: 'var(--space-1)' }}>
            {t('patch_patched_sig')}
          </div>
          <pre className="code-block">+ {selectedPatch.patchedReplacement}</pre>
        </div>

        <div className="badge">
          <CheckCircle2 size={14} aria-hidden="true" />
          <span>
            {verifyUpstreamPatchTarget(selectedPatch, buildSimulatedContent(selectedPatch), true).detail}
          </span>
        </div>
      </div>
    </div>
  );
};
