import { createContext, useContext } from 'react';

export const TutorialContext = createContext({
  enabled: false,
  toggle: () => {},
  disable: () => {},
  isHintDismissed: () => false,
  dismissHint: () => {}
});

export const useTutorial = () => useContext(TutorialContext);
