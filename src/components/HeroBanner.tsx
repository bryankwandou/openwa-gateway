import React from 'react';
import { Code2, Play, Terminal } from 'lucide-react';
import { useAppPreferences } from '../context/AppPreferencesContext.tsx';

interface HeroBannerProps {
  lidCount: number;
  onFocusConsole: () => void;
  githubRepoUrl: string;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({ lidCount, onFocusConsole, githubRepoUrl }) => {
  const { t } = useAppPreferences();

  return (
    <section className="hero-card">
      <div>
        <div className="release-pill">
          <Terminal size={14} aria-hidden="true" />
          <span>{t('release_badge')}</span>
        </div>

        <h1 className="hero-headline">
          <span>{t('hero_title_line1')}</span>
          <span className="hero-headline-accent">{t('hero_title_line2')}</span>
        </h1>

        <p className="hero-description">{t('hero_desc')}</p>

        <div className="hero-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onFocusConsole}
            aria-label={t('btn_get_started')}
          >
            <Play size={18} aria-hidden="true" />
            <span>{t('btn_get_started')}</span>
          </button>

          <a
            href={githubRepoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
            aria-label={t('btn_view_github')}
          >
            <Code2 size={18} aria-hidden="true" />
            <span>{t('btn_view_github')}</span>
          </a>
        </div>
      </div>

      <div className="telemetry-grid">
        <div className="telemetry-box">
          <div className="telemetry-label">{t('metric_engines')}</div>
          <div className="telemetry-value">2 (Baileys / WWebJS)</div>
        </div>
        <div className="telemetry-box">
          <div className="telemetry-label">{t('metric_patches')}</div>
          <div className="telemetry-value">12 / 12 Verified</div>
        </div>
        <div className="telemetry-box">
          <div className="telemetry-label">{t('metric_lid_mappings')}</div>
          <div className="telemetry-value">{lidCount} Active</div>
        </div>
        <div className="telemetry-box">
          <div className="telemetry-label">{t('metric_mcp_tools')}</div>
          <div className="telemetry-value">4 Streamable-HTTP</div>
        </div>
      </div>
    </section>
  );
};
