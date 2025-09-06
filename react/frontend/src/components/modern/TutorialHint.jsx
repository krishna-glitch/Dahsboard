import React from 'react';
import { useTutorial } from '../../contexts/TutorialContext';

const TutorialHint = ({ id, title = 'Tip', children, style = {}, className = '' }) => {
  const { enabled, isHintDismissed, dismissHint } = useTutorial();

  if (!enabled || isHintDismissed(id)) return null;

  return (
    <div className={`tutorial-hint ${className}`} style={{
      padding: '12px 14px',
      border: '1px solid var(--border-primary)',
      background: 'var(--surface-primary)',
      color: 'var(--text-primary)',
      borderRadius: '8px',
      boxShadow: 'var(--shadow-md)',
      fontSize: '0.85rem',
      ...style
    }} role="note" aria-live="polite">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="bi bi-mortarboard" aria-hidden="true"></i>
          {title}
        </div>
        <button
          onClick={() => dismissHint(id)}
          className="btn btn-outline-secondary btn-sm"
          style={{ padding: '2px 8px' }}
          aria-label="Dismiss tutorial hint"
        >
          Dismiss
        </button>
      </div>
      <div>{children}</div>
    </div>
  );
};

export default TutorialHint;

