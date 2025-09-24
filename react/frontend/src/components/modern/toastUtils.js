import React from 'react';
import toast from 'react-hot-toast';
import Icon from './Icon';

/**
 * Enhanced toast utilities using react-hot-toast
 * Replaces 403-line custom ToastNotification.jsx with 2KB library
 * Provides same API but with better performance and animations
 */

// Custom toast styling to match our design system
const getToastStyle = (type) => {
  const baseStyle = {
    borderRadius: '8px',
    background: 'var(--surface-primary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-primary)',
    fontSize: '14px',
    padding: '12px 16px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
  };

  switch (type) {
    case 'success':
      return {
        ...baseStyle,
        borderColor: 'var(--success-color)',
        background: 'rgba(34, 197, 94, 0.1)',
      };
    case 'error':
      return {
        ...baseStyle,
        borderColor: 'var(--danger-color)',
        background: 'rgba(239, 68, 68, 0.1)',
      };
    case 'warning':
      return {
        ...baseStyle,
        borderColor: 'var(--warning-color)',
        background: 'rgba(245, 158, 11, 0.1)',
      };
    default:
      return {
        ...baseStyle,
        borderColor: 'var(--primary-color)',
        background: 'rgba(59, 130, 246, 0.1)',
      };
  }
};

// Create enhanced toast functions with our styling
export const useToast = () => ({
  showSuccess: (message, options = {}) => {
    return toast.success(message, {
      duration: options.duration || 4000,
      style: getToastStyle('success'),
      icon:
        options.icon ||
        React.createElement(Icon, {
          name: 'check-circle-fill',
          size: '1.25rem',
          color: 'var(--success-color)'
        }),
      ...options,
    });
  },

  showError: (message, options = {}) => {
    return toast.error(message, {
      duration: options.duration || 6000,
      style: getToastStyle('error'),
      icon:
        options.icon ||
        React.createElement(Icon, {
          name: 'x-circle-fill',
          size: '1.25rem',
          color: 'var(--danger-color)'
        }),
      ...options,
    });
  },

  showWarning: (message, options = {}) => {
    return toast(message, {
      duration: options.duration || 5000,
      style: getToastStyle('warning'),
      icon:
        options.icon ||
        React.createElement(Icon, {
          name: 'exclamation-triangle-fill',
          size: '1.25rem',
          color: 'var(--warning-color)'
        }),
      ...options,
    });
  },

  showInfo: (message, options = {}) => {
    return toast(message, {
      duration: options.duration || 4000,
      style: getToastStyle('info'),
      icon:
        options.icon ||
        React.createElement(Icon, {
          name: 'info-circle-fill',
          size: '1.25rem',
          color: 'var(--primary-color)'
        }),
      ...options,
    });
  },

  showLoading: (message, options = {}) => {
    return toast.loading(message, {
      style: getToastStyle('info'),
      ...options,
    });
  },

  dismiss: (toastId) => {
    if (toastId) {
      toast.dismiss(toastId);
    } else {
      toast.dismiss();
    }
  },

  promise: (promise, messages) => {
    return toast.promise(promise, {
      loading: messages.loading || 'Loading...',
      success: messages.success || 'Success!',
      error: messages.error || 'Error occurred',
    });
  },
});

// Export individual functions for backward compatibility
export const showSuccess = (message, options) => useToast().showSuccess(message, options);
export const showError = (message, options) => useToast().showError(message, options);
export const showWarning = (message, options) => useToast().showWarning(message, options);
export const showInfo = (message, options) => useToast().showInfo(message, options);
export const showLoading = (message, options) => useToast().showLoading(message, options);

export default useToast;
