// Auth utility functions
// Moved from AuthContext.jsx to resolve react-refresh/only-export-components warning

import { useContext } from 'react';
import { AuthContext } from './AuthContextDefinition';
import { getAuthHealth } from '../services/api';

// Custom hook to use the AuthContext  
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Attempt soft reauth via /auth/health, then invoke provided refresher on success
export const reauthIfPossible = async (refreshFn) => {
  try {
    const health = await getAuthHealth();
    if (health && health.ok && health.authenticated) {
      if (typeof refreshFn === 'function') {
        await refreshFn(false);
      }
    }
    return health;
  } catch (e) {
    return { ok: false, authenticated: false, error: e?.message };
  }
};
