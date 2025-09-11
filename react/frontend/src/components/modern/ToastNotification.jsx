import React, { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Toast Notification Component - Global notification system
 * Provides contextual notifications with auto-dismiss and action support
 */
const Toast = ({ 
  id,
  type = 'info',
  title,
  message,
  duration = 5000,
  persistent = false,
  actions = [],
  onDismiss,
  onAction,
  onTogglePin,
  progress = false,
  icon: customIcon,
  isExiting: isExitingFromProvider = false
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [timeLeft, setTimeLeft] = useState(duration);

  // Use ref to avoid circular dependencies in useEffect
  const dismissRef = useRef();
  const isInitialRenderRef = useRef(true);
  
  // Update ref in useEffect to avoid setState during render
  useEffect(() => {
    dismissRef.current = () => {
      // Prevent dismiss during initial render
      if (isInitialRenderRef.current) {
        return;
      }
      onDismiss?.(id);
    };
  }, [id, onDismiss]);

  const handleDismiss = useCallback(() => {
    dismissRef.current?.();
  }, []);

  const handleAction = useCallback((actionId, action) => {
    try {
      if (action && typeof action.action === 'function') {
        const maybePromise = action.action();
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.catch((e) => { try { console.warn('[TOAST] action failed', e); } catch { /* ignore */ } });
        }
      }
    } catch (e) { try { console.warn('[TOAST] action handler threw', e); } catch { /* ignore */ } }
    try { onAction?.(id, actionId, action); } catch (e) { try { console.warn('[TOAST] onAction failed', e); } catch { /* ignore */ } }
    if (!action?.keepOpen) {
      handleDismiss();
    }
  }, [id, onAction, handleDismiss]);

  useEffect(() => {
    // Mark initial render as complete
    isInitialRenderRef.current = false;
    
    // Animate in
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (persistent || duration <= 0) return;

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 100) {
          // Schedule dismiss for next tick to avoid setState during render
          setTimeout(() => {
            // Double-check we're not in initial render
            if (!isInitialRenderRef.current) {
              dismissRef.current?.();
            }
          }, 0);
          return 0;
        }
        return prev - 100;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [duration, persistent]); // Removed handleDismiss dependency

  const getIcon = () => {
    if (customIcon) return customIcon;
    
    switch (type) {
      case 'success':
        return 'bi-check-circle-fill';
      case 'error':
        return 'bi-exclamation-triangle-fill';
      case 'warning':
        return 'bi-exclamation-triangle-fill';
      case 'info':
        return 'bi-info-circle-fill';
      case 'loading':
        return 'bi-arrow-repeat spin';
      default:
        return 'bi-info-circle-fill';
    }
  };

  const progressPercentage = duration > 0 ? ((duration - timeLeft) / duration) * 100 : 0;

  return (
    <div 
      className={`toast-notification toast-${type} ${isVisible ? 'toast-visible' : ''} ${isExitingFromProvider ? 'toast-exiting' : ''}`}
      role="alert"
      aria-live="polite"
    >
      {progress && !persistent && duration > 0 && (
        <div className="toast-progress-bar">
          <div 
            className="toast-progress-fill"
            style={{ width: `${progressPercentage}%` }}
          ></div>
        </div>
      )}
      
      <div className="toast-content">
        <div className="toast-icon">
          <i className={`bi ${getIcon()}`}></i>
        </div>
        
        <div className="toast-body">
          {title && <div className="toast-title">{title}</div>}
          <div className="toast-message">{message}</div>
          
          {actions.length > 0 && (
            <div className="toast-actions">
              {actions.map((action, index) => (
                <button
                  key={action.id || index}
                  onClick={() => handleAction(action.id || index, action)}
                  className={`toast-action-btn toast-action-${action.style || 'primary'}`}
                  disabled={action.disabled}
                >
                  {action.icon && <i className={`bi bi-${action.icon}`}></i>}
                  {action.label || action.text}
                </button>
              ))}
            </div>
          )}
        </div>
        
        <button
          onClick={() => onTogglePin?.(id, !persistent)}
          className={`toast-pin ${persistent ? 'toast-pinned' : ''}`}
          title={persistent ? 'Unpin (allow auto-dismiss)' : 'Pin (keep open)'}
          aria-label={persistent ? 'Unpin notification' : 'Pin notification'}
        >
          <i className={`bi ${persistent ? 'bi-pin-angle-fill' : 'bi-pin-angle'}`}></i>
        </button>
        {!persistent && (
          <button
            onClick={handleDismiss}
            className="toast-dismiss"
            aria-label="Dismiss notification"
          >
            <i className="bi bi-x"></i>
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Toast Container - Manages multiple toasts
 */
const ToastContainer = ({ toasts, onDismiss, onAction, onTogglePin, onClearAll, position = 'top-right' }) => {
  return (
    <div className={`toast-container toast-position-${position}`}>
      {toasts.length > 0 && (
        <div className="toast-toolbar">
          <button className="toast-toolbar-btn" onClick={onClearAll} title="Dismiss all" aria-label="Dismiss all toasts">
            <i className="bi bi-x-circle"></i> Dismiss All
          </button>
        </div>
      )}
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          {...toast}
          onDismiss={onDismiss}
          onAction={onAction}
          onTogglePin={onTogglePin}
        />
      ))}
    </div>
  );
};

/**
 * Toast Context and Hook for global toast management
 */
import { ToastContext } from './toastContext';

let __toastCounter = 0;
export const ToastProvider = ({ children, maxToasts = 5, exitDuration = 300 }) => {
  const [toasts, setToasts] = useState([]);
  const lastShownMapRef = useRef(new Map()); // key -> timestamp

  const buildKey = (toast) => {
    const key = toast.dedupeKey || `${toast.type || 'info'}|${(toast.title || '').trim().toLowerCase()}|${(toast.message || '').trim().toLowerCase()}`;
    return key;
  };

  const getDefaultDuration = (type) => {
    switch (type) {
      case 'success': return 4000;
      case 'error': return 6000;
      case 'warning': return 5000;
      case 'loading': return 10000;
      default: return 4000;
    }
  };

  const getDefaultPosition = (type) => {
    // Standardize default positions by severity
    // Long-running loads and important alerts at top-right; info at bottom-right
    switch (type) {
      case 'loading': return 'top-right';
      case 'error': return 'top-right';
      case 'warning': return 'top-right';
      case 'success': return 'top-right';
      case 'info':
      default:
        return 'bottom-right';
    }
  };

  const addToast = useCallback((toast) => {
    // Generate stable unique id to avoid key collisions
    const id = toast.id || `t_${Date.now()}_${(++__toastCounter).toString(36)}`;
    const newToast = {
      ...toast,
      id,
      timestamp: Date.now(),
      originalDuration: typeof toast.duration === 'number' ? toast.duration : getDefaultDuration(toast.type),
      position: toast.position || getDefaultPosition(toast.type)
    };
    const key = buildKey(newToast);
    const windowMs = typeof newToast.dedupeWindowMs === 'number' ? newToast.dedupeWindowMs : 1500;
    setToasts(prevToasts => {
      const now = Date.now();
      // If a toast with same key exists within window, skip adding
      const existing = prevToasts.find(t => buildKey(t) === key);
      if (existing && (now - (existing.timestamp || 0) < windowMs)) {
        return prevToasts;
      }
      lastShownMapRef.current.set(key, now);
      const updated = [newToast, ...prevToasts.slice(0, maxToasts - 1)];
      return updated;
    });
    
    return id;
  }, [maxToasts]);

  const removeToast = useCallback((id) => {
    // Prevent duplicate removal calls
    setToasts(prevToasts => {
      // Check if toast exists and isn't already exiting
      const existingToast = prevToasts.find(toast => toast.id === id);
      if (!existingToast || existingToast.isExiting) {
        return prevToasts; // No change if toast doesn't exist or is already exiting
      }
      
      // Mark as exiting
      const updatedToasts = prevToasts.map(toast =>
        toast.id === id ? { ...toast, isExiting: true } : toast
      );
      
      // Schedule removal after animation (configurable)
      setTimeout(() => {
        setToasts(currentToasts => {
          return currentToasts.filter(toast => toast.id !== id);
        });
      }, Number.isFinite(exitDuration) ? exitDuration : 300);
      
      return updatedToasts;
    });
  }, [exitDuration]);

  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const updateToast = useCallback((id, updates) => {
    setToasts(prevToasts =>
      prevToasts.map(toast =>
        toast.id === id ? { ...toast, ...updates } : toast
      )
    );
  }, []);

  const togglePinToast = useCallback((id, pin) => {
    setToasts(prev => prev.map(t => {
      if (t.id !== id) return t;
      // When pinning, force persistent and duration 0
      if (pin) return { ...t, persistent: true, duration: 0 };
      // When unpinning, restore to original duration and allow auto-dismiss
      const restored = t.originalDuration != null ? t.originalDuration : getDefaultDuration(t.type);
      return { ...t, persistent: false, duration: restored };
    }));
  }, []);

  // Convenience methods for different toast types
  const showSuccess = useCallback((message, options = {}) => {
    return addToast({
      type: 'success',
      message,
      duration: 4000,
      ...options
    });
  }, [addToast]);

  const showError = useCallback((message, options = {}) => {
    return addToast({
      type: 'error',
      message,
      duration: 6000,
      persistent: false, // Allow dismissal
      ...options
    });
  }, [addToast]);

  const showWarning = useCallback((message, options = {}) => {
    return addToast({
      type: 'warning',
      message,
      duration: 5000,
      ...options
    });
  }, [addToast]);

  const showInfo = useCallback((message, options = {}) => {
    return addToast({
      type: 'info',
      message,
      duration: 4000,
      ...options
    });
  }, [addToast]);

  const showLoading = useCallback((message, options = {}) => {
    return addToast({
      type: 'loading',
      message,
      persistent: false, // Allow dismissal for loading toasts too
      progress: false,
      duration: 10000, // Auto-dismiss after 10 seconds if not manually dismissed
      ...options
    });
  }, [addToast]);

  const value = {
    toasts,
    addToast,
    removeToast,
    clearAllToasts,
    updateToast,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showLoading
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {['top-right','bottom-right','top-left','bottom-left'].map(pos => {
        const items = toasts.filter(t => t.position === pos);
        if (items.length === 0) return null;
        return (
          <ToastContainer
            key={pos}
            toasts={items}
            position={pos}
            onDismiss={removeToast}
            onAction={(toastId, actionId, action) => {
              console.log(`Toast ${toastId} executed action ${actionId}:`, action);
            }}
            onTogglePin={togglePinToast}
            onClearAll={clearAllToasts}
          />
        );
      })}
    </ToastContext.Provider>
  );
};

// Toast utilities exported from separate toastUtils.js file for fast refresh compatibility

export { Toast, ToastContainer };
export default Toast;
