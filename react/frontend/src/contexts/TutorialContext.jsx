import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const TutorialContext = createContext({
  enabled: false,
  toggle: () => {},
  disable: () => {},
  isHintDismissed: () => false,
  dismissHint: () => {}
});

const STORAGE_ENABLED = 'tutorial_enabled';
const STORAGE_HINTS = 'tutorial_dismissed_hints';

export const TutorialProvider = ({ children }) => {
  const [enabled, setEnabled] = useState(false);
  const [dismissed, setDismissed] = useState(() => new Set());

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_ENABLED);
      if (raw != null) setEnabled(raw === 'true');
      const hintsRaw = window.localStorage.getItem(STORAGE_HINTS);
      if (hintsRaw) {
        const arr = JSON.parse(hintsRaw);
        if (Array.isArray(arr)) setDismissed(new Set(arr));
      }
    } catch (error) {
      console.warn('Failed to load tutorial hints from storage:', error);
    }
  }, []);

  useEffect(() => {
    try { 
      window.localStorage.setItem(STORAGE_ENABLED, String(enabled)); 
    } catch (error) {
      console.warn('Failed to save tutorial enabled state:', error);
    }
  }, [enabled]);

  const isHintDismissed = (id) => dismissed.has(id);
  const dismissHint = (id) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(id);
      try { 
        window.localStorage.setItem(STORAGE_HINTS, JSON.stringify(Array.from(next))); 
      } catch (error) {
        console.warn('Failed to save dismissed hints:', error);
      }
      return next;
    });
  };

  const value = useMemo(() => ({
    enabled,
    toggle: () => setEnabled(v => !v),
    disable: () => setEnabled(false),
    isHintDismissed,
    dismissHint
  }), [enabled, dismissed, isHintDismissed]);

  return (
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  );
};

export const useTutorial = () => useContext(TutorialContext);

