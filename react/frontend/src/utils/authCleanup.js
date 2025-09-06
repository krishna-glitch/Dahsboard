/**
 * Authentication Cleanup Utilities
 * Removes legacy authentication data from localStorage
 */

export const clearLegacyAuthData = () => {
  const legacyKeys = [
    'water_quality_auth',
    'water_quality_auth_timestamp',
    'auth_token',
    'user_session',
    'login_state'
  ];
  
  legacyKeys.forEach(key => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn(`Could not remove legacy auth key: ${key}`, error);
    }
  });
};

export const debugAuthState = () => {
  console.log('🔍 Debug Auth State:');
  console.log('localStorage keys:', Object.keys(localStorage));
  console.log('sessionStorage keys:', Object.keys(sessionStorage));
  
  // Check for any auth-related keys
  const authKeys = Object.keys(localStorage).filter(key => 
    key.toLowerCase().includes('auth') || 
    key.toLowerCase().includes('login') ||
    key.toLowerCase().includes('session') ||
    key.toLowerCase().includes('user')
  );
  
  if (authKeys.length > 0) {
    console.warn('⚠️ Found potential legacy auth keys:', authKeys);
  } else {
    console.log('✅ No legacy auth keys found');
  }
};