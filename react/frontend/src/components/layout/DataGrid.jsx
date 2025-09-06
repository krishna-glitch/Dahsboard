import React from 'react';
import PropTypes from 'prop-types';
import './DataGrid.css';

/**
 * Responsive Data Grid Component for Charts and Visualizations
 * Optimized for Plotly charts and dashboard data
 */
export const DataGrid = ({ 
  children, 
  columns = 'auto',
  gap = 'lg',
  className = '',
  minItemWidth = '400px',
  equalHeight = false,
  ...props 
}) => {
  
  const getGridColumns = () => {
    if (typeof columns === 'number') {
      return `repeat(${columns}, 1fr)`;
    }
    if (columns === 'auto') {
      return `repeat(auto-fit, minmax(${minItemWidth}, 1fr))`;
    }
    return columns;
  };
  
  const gridStyle = {
    gridTemplateColumns: getGridColumns(),
    ...props.style
  };
  
  return (
    <div 
      className={`data-grid gap-${gap} ${equalHeight ? 'equal-height' : ''} ${className}`}
      style={gridStyle}
      {...props}
    >
      {children}
    </div>
  );
};

/**
 * Data Grid Item Component
 * Wrapper for individual charts or data components
 */
export const DataGridItem = ({ 
  children, 
  columnSpan = 1, 
  rowSpan = 1,
  className = '',
  ...props 
}) => {
  const itemStyle = {
    gridColumn: `span ${columnSpan}`,
    gridRow: `span ${rowSpan}`,
    ...props.style
  };
  
  return (
    <div 
      className={`data-grid-item ${className}`}
      style={itemStyle}
      {...props}
    >
      {children}
    </div>
  );
};


DataGrid.propTypes = {
  children: PropTypes.node.isRequired,
  columns: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  gap: PropTypes.oneOf(['xs', 'sm', 'md', 'lg', 'xl']),
  className: PropTypes.string,
  minItemWidth: PropTypes.string,
  equalHeight: PropTypes.bool
};

DataGridItem.propTypes = {
  children: PropTypes.node.isRequired,
  columnSpan: PropTypes.number,
  rowSpan: PropTypes.number,
  className: PropTypes.string
};


export default DataGrid;