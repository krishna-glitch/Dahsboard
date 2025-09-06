import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * Modern Modal Component - Matches design system and ESLint standards
 * Features: Accessibility, animations, responsive design, focus management
 */
const Modal = ({ 
  show, 
  onClose, 
  title, 
  children, 
  size = 'medium',
  variant = 'default',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscapeKey = true,
  className = '',
  headerActions = null,
  footerActions = null,
  loading = false
}) => {
  const modalRef = useRef(null);
  const previousActiveElement = useRef(null);

  // Memoized escape key handler
  const handleEscapeKey = useCallback((event) => {
    if (event.key === 'Escape' && closeOnEscapeKey) {
      onClose();
    }
  }, [closeOnEscapeKey, onClose]);

  // Memoized overlay click handler
  const handleOverlayClick = useCallback((e) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose();
    }
  }, [closeOnOverlayClick, onClose]);

  // Handle escape key
  useEffect(() => {
    if (!show) return undefined;

    document.addEventListener('keydown', handleEscapeKey);
    return () => document.removeEventListener('keydown', handleEscapeKey);
  }, [show, handleEscapeKey]);

  // Focus management for accessibility
  useEffect(() => {
    if (show) {
      // Store currently focused element
      previousActiveElement.current = document.activeElement;
      
      // Focus first focusable element in modal
      const focusTimeout = setTimeout(() => {
        const firstFocusable = modalRef.current?.querySelector(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        firstFocusable?.focus();
      }, 100);

      return () => clearTimeout(focusTimeout);
    } else {
      // Restore focus when modal closes
      previousActiveElement.current?.focus();
      return undefined;
    }
  }, [show]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (show) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
    return undefined;
  }, [show]);

  // Size class mapping
  const getSizeClass = () => {
    const sizeMap = {
      small: 'modal-size-sm',
      medium: 'modal-size-md', 
      large: 'modal-size-lg',
      fullscreen: 'modal-size-fullscreen'
    };
    return sizeMap[size] || 'modal-size-md';
  };

  // Variant class mapping
  const getVariantClass = () => {
    const variantMap = {
      default: 'modal-variant-default',
      danger: 'modal-variant-danger',
      success: 'modal-variant-success',
      warning: 'modal-variant-warning'
    };
    return variantMap[variant] || 'modal-variant-default';
  };

  if (!show) return null;

  const modalContent = (
    <div 
      className={`modern-modal-overlay ${show ? 'show' : ''}`}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
    >
      <div 
        ref={modalRef}
        className={`modern-modal-container ${getSizeClass()} ${getVariantClass()} ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {loading && (
          <div className="modal-loading-overlay" aria-label="Loading">
            <div className="modal-spinner">
              <i className="bi bi-arrow-clockwise spinner-icon" aria-hidden="true"></i>
            </div>
          </div>
        )}

        {(title || showCloseButton || headerActions) && (
          <div className="modern-modal-header">
            <div className="modal-header-content">
              {title && (
                <h2 id="modal-title" className="modern-modal-title">
                  {title}
                </h2>
              )}
              <div className="modal-header-actions">
                {headerActions}
                {showCloseButton && (
                  <button 
                    onClick={onClose}
                    className="modern-modal-close"
                    aria-label="Close modal"
                    type="button"
                  >
                    <i className="bi bi-x" aria-hidden="true"></i>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        
        <div className="modern-modal-content">
          {children}
        </div>

        {footerActions && (
          <div className="modern-modal-footer">
            {footerActions}
          </div>
        )}
      </div>
    </div>
  );

  // Render in portal to avoid z-index issues
  return createPortal(modalContent, document.body);
};

export default Modal;