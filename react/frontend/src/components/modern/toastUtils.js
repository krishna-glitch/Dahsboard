// Toast utility functions and HOC
// Moved from ToastNotification.jsx to resolve react-refresh/only-export-components warning

import React, { useContext } from 'react';
import { ToastContext } from './toastContext';

/**
 * Hook to use toast notifications
 */
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

/**
 * Higher-order component to wrap components with toast functionality
 */
export const withToast = (WrappedComponent) => {
  const ToastifiedComponent = (props) => {
    const toast = useToast();
    return React.createElement(WrappedComponent, { ...props, toast });
  };
  
  ToastifiedComponent.displayName = `withToast(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;
  
  return ToastifiedComponent;
};