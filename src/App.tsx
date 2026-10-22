import React, { useMemo, useState } from 'react';
import { Cpu, Fingerprint, GitPullRequest, Shield } from 'lucide-react';
import { AppPreferencesProvider, useAppPreferences } from './context/AppPreferencesContext.tsx';
import { HeaderBar } from './components/HeaderBar.tsx';
import { HeroBanner } from './components/HeroBanner.tsx';
import { EngineConsole } from './components/EngineConsole.tsx';
import { IdentityInspector } from './components/IdentityInspector.tsx';
import { PatchPipelineViewer } from './components/PatchPipelineViewer.tsx';
import { SecurityWebhookMcpPanel } from './components/SecurityWebhookMcpPanel.tsx';
import { PinGateModal } from './components/PinGateModal.tsx';
import { INITIAL_LID_MAPPINGS, LidMappingStore } from './core/identity/lid-mapping-store.ts';

type ActiveTab = 'engines' | 'identity' | 'patches' | 'security';

const GatewayWorkstation: React.FC = () => {
  const { t } = useAppPreferences();
  const [activeTab, setActiveTab] = useState<ActiveTab>('engines');
  const lidStore = useMemo(() => new LidMappingStore(INITIAL_LID_MAPPINGS), []);
  const [lidCount, setLidCount] = useState<number>(() => lidStore.listBySession().length);

  return (
    <div className="app-shell">
      <HeaderBar />

      <HeroBanner
        lidCount={lidCount}
        onFocusConsole={() => setActiveTab('engines')}
        githubRepoUrl="https://github.com/bryankwandou/openwa-gateway"
      />

      <nav className="nav-tabs" aria-label="Subsystem navigation">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'engines' ? 'active' : ''}`}
          onClick={() => setActiveTab('engines')}
          aria-label={t('tab_engines')}
        >
          <Cpu size={16} aria-hidden="true" />
          <span>{t('tab_engines')}</span>
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === 'identity' ? 'active' : ''}`}
          onClick={() => setActiveTab('identity')}
          aria-label={t('tab_identity')}
        >
          <Fingerprint size={16} aria-hidden="true" />
          <span>{t('tab_identity')}</span>
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === 'patches' ? 'active' : ''}`}
          onClick={() => setActiveTab('patches')}
          aria-label={t('tab_patches')}
        >
          <GitPullRequest size={16} aria-hidden="true" />
          <span>{t('tab_patches')}</span>
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === 'security' ? 'active' : ''}`}
          onClick={() => setActiveTab('security')}
          aria-label={t('tab_security')}
        >
          <Shield size={16} aria-hidden="true" />
          <span>{t('tab_security')}</span>
        </button>
      </nav>

      <main>
        {activeTab === 'engines' && <EngineConsole lidStore={lidStore} />}
        {activeTab === 'identity' && (
          <IdentityInspector
            lidStore={lidStore}
            onMappingsUpdated={() => setLidCount(lidStore.listBySession().length)}
          />
        )}
        {activeTab === 'patches' && <PatchPipelineViewer />}
        {activeTab === 'security' && <SecurityWebhookMcpPanel lidStore={lidStore} />}
      </main>

      <PinGateModal />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AppPreferencesProvider>
      <GatewayWorkstation />
    </AppPreferencesProvider>
  );
};

export default App;
