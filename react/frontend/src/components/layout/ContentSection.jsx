import React from 'react';
import PropTypes from 'prop-types';
import './ContentSection.css';

/**
 * Reusable Content Section Component
 * Semantic HTML5 section with consistent styling
 */
export const ContentSection = ({ 
  children, 
  title, 
  subtitle, 
  actions,
  variant = 'default',
  className = '',
  ...props 
}) => {
  return (
    <section 
      className={`content-section content-section--${variant} ${className}`}
      {...props}
    >
      {(title || subtitle || actions) && (
        <header className="content-section-header">
          <div className="content-section-title-area">
            {title && <h2 className="content-section-title">{title}</h2>}
            {subtitle && <p className="content-section-subtitle">{subtitle}</p>}
          </div>
          {actions && (
            <div className="content-section-actions">
              {actions}
            </div>
          )}
        </header>
      )}
      
      <div className="content-section-body">
        {children}
      </div>
    </section>
  );
};

ContentSection.propTypes = {
  children: PropTypes.node.isRequired,
  title: PropTypes.string,
  subtitle: PropTypes.string,
  actions: PropTypes.node,
  variant: PropTypes.oneOf(['default', 'primary', 'secondary', 'accent']),
  className: PropTypes.string
};

export default ContentSection;