import React, { useState } from 'react';
import { KeyRound, ShieldCheck, X } from 'lucide-react';
import { useAppPreferences } from '../context/AppPreferencesContext.tsx';

export const PinGateModal: React.FC = () => {
  const { pendingPinModalOpen, closePinModal, submitOperatorPin, t } = useAppPreferences();
  const [pinInput, setPinInput] = useState('278500');
  const [hasError, setHasError] = useState(false);

  if (!pendingPinModalOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = submitOperatorPin(pinInput.trim());
    if (!ok) {
      setHasError(true);
    } else {
      setHasError(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="pin-modal-heading">
      <form className="modal-card" onSubmit={handleSubmit}>
        <div className="panel-header">
          <div>
            <h2 id="pin-modal-heading" className="panel-title">
              {t('pin_modal_title')}
            </h2>
            <p className="panel-subtitle">{t('pin_modal_desc')}</p>
          </div>
          <button type="button" className="btn" onClick={closePinModal} aria-label={t('btn_cancel')}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="form-field">
          <label htmlFor="operator-pin-field" className="form-label">
            {t('pin_input_label')}
          </label>
          <input
            id="operator-pin-field"
            type="password"
            inputMode="numeric"
            maxLength={6}
            className="input-control"
            value={pinInput}
            onChange={e => {
              setPinInput(e.target.value);
              setHasError(false);
            }}
          />
        </div>

        {hasError && <div className="badge badge-error">{t('pin_error_invalid')}</div>}

        <div className="hero-actions">
          <button type="submit" className="btn btn-primary" aria-label={t('btn_verify_pin')}>
            <ShieldCheck size={18} aria-hidden="true" />
            <span>{t('btn_verify_pin')}</span>
          </button>
          <button type="button" className="btn" onClick={closePinModal} aria-label={t('btn_cancel')}>
            <KeyRound size={18} aria-hidden="true" />
            <span>{t('btn_cancel')}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
