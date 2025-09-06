import React from 'react';

/**
 * Professional Icon Component
 * Replaces tacky emoji icons with Bootstrap Icons
 */
const Icon = ({ name, size = '1rem', color = 'currentColor', className = '', style = {} }) => {
  return (
    <i 
      className={`bi bi-${name} ${className}`}
      style={{
        fontSize: size,
        color: color,
        ...style
      }}
    />
  );
};

export default Icon;