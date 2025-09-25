import React, { useState, useRef } from 'react';
import Dropdown from 'react-bootstrap/Dropdown';
import Spinner from 'react-bootstrap/Spinner';
import { useToast } from './modern/toastUtils';
import { 
  performExport,
  EXPORT_FORMATS, 
  formatFilename,
  validateExportData
} from '../utils/exporters';

/**
 * Comprehensive Export Button Component
 * Provides export functionality for charts, data, and insights across all pages
 */
const ExportButton = ({
  // Data exports
  data = null,
  filename = 'export',
  
  // Chart exports
  chartElementId = null,
  
  // Insights exports
  insights = null,
  insightsMetadata = {},
  
  // Component configuration
  variant = 'outline-primary',
  size = 'sm',
  disabled = false,
  className = '',
  activeView = 'overview',
  
  // Export options
  availableFormats = ['csv', 'json', 'png', 'pdf'],
  
  // Callbacks
  onExportStart = () => {},
  onExportComplete = () => {},
  onExportError = () => {}
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const toast = useToast();

  // Determine what can be exported based on props
  const canExportData = data && Array.isArray(data) && data.length > 0;
  const canExportChart = chartElementId && document.getElementById(chartElementId) && activeView !== 'details';
  const canExportInsights = insights && typeof insights === 'object';

  const isDisabled = disabled || (!canExportData && !canExportChart && !canExportInsights);

  const handleExport = async (format) => {
    if (isDisabled || isExporting) return;

    // Close dropdown when export starts
    setIsDropdownOpen(false);
    setIsExporting(true);
    onExportStart();

    // Show loading notification
    const loadingToastId = toast.showLoading(`Exporting ${format.toUpperCase()}...`, {
      title: 'Export in Progress'
    });

    try {
      let result;
      const exportFilename = formatFilename(filename);

      // Determine export type and configuration
      if (format === EXPORT_FORMATS.PNG || format === EXPORT_FORMATS.JPG || format === EXPORT_FORMATS.PDF) {
        // Chart export
        if (canExportChart) {
          result = await performExport({
            type: 'chart',
            format,
            filename: exportFilename,
            elementId: chartElementId
          });
        } else {
          throw new Error(`Chart export requested but no chart element found with ID: ${chartElementId}`);
        }
      } else if (format === EXPORT_FORMATS.CSV || format === EXPORT_FORMATS.JSON) {
        // Data export
        if (canExportData) {
          const validation = validateExportData(data);
          if (!validation.valid) {
            throw new Error(validation.error);
          }

          result = await performExport({
            type: 'data',
            format,
            filename: exportFilename,
            data
          });
        } else if (canExportInsights) {
          // Export insights in requested format
          result = await performExport({
            type: 'insights',
            format,
            filename: exportFilename,
            insights,
            metadata: insightsMetadata
          });
        } else {
          throw new Error('No data available for export');
        }
      } else {
        throw new Error(`Unsupported export format: ${format}`);
      }

      // Remove loading toast and show success
      toast.removeToast(loadingToastId);
      toast.showSuccess(
        `Successfully exported ${result.rows ? `${result.rows} records` : 'data'} as ${result.format}`,
        {
          title: 'Export Complete',
          actions: [{
            id: 'view',
            label: 'View File',
            action: () => { /* File viewer integration would be implemented here */ }
          }]
        }
      );

      onExportComplete(result);

    } catch (error) {
      console.error('Export failed:', error);
      
      // Remove loading toast and show error
      toast.removeToast(loadingToastId);
      toast.showError(
        error.message,
        {
          title: 'Export Failed',
          actions: [{
            id: 'retry',
            label: 'Try Again',
            action: () => handleExport(format)
          }]
        }
      );

      onExportError(error);
    } finally {
      setIsExporting(false);
    }
  };

  const getAvailableExportOptions = () => {
    const options = [];
    
    if (availableFormats.includes('csv') && (canExportData || canExportInsights)) {
      options.push({ format: EXPORT_FORMATS.CSV, label: 'CSV Data', icon: 'file-earmark-spreadsheet' });
    }
    
    if (availableFormats.includes('json') && (canExportData || canExportInsights)) {
      options.push({ format: EXPORT_FORMATS.JSON, label: 'JSON Data', icon: 'file-earmark-code' });
    }
    
    if (availableFormats.includes('png') && canExportChart) {
      options.push({ format: EXPORT_FORMATS.PNG, label: 'PNG Image', icon: 'image' });
    }
    
    if (availableFormats.includes('pdf') && (canExportChart || canExportInsights)) {
      options.push({ format: EXPORT_FORMATS.PDF, label: 'PDF Document', icon: 'file-earmark-pdf' });
    }

    return options;
  };

  const exportOptions = getAvailableExportOptions();

  // Simple export button if only one option
  if (exportOptions.length === 1) {
    const option = exportOptions[0];
    return (
      <button
        className={`btn btn-${variant} ${size ? `btn-${size}` : ''} ${className}`}
        onClick={() => handleExport(option.format)}
        disabled={isDisabled || isExporting}
        title={`Export as ${option.label}`}
      >
        {isExporting ? (
          <>
            <Spinner
              as="span"
              animation="border"
              size="sm"
              role="status"
              aria-hidden="true"
              className="me-1"
            />
            Exporting...
          </>
        ) : (
          <>
            <i className={`bi bi-${option.icon} me-1`}></i>
            Export
          </>
        )}
      </button>
    );
  }

  // Dropdown for multiple export options
  return (
    <Dropdown 
      ref={dropdownRef} 
      className={`export-dropdown ${className || ''}`} 
      drop="down"
      show={isDropdownOpen}
      onToggle={setIsDropdownOpen}
    >
      <Dropdown.Toggle
        variant={variant}
        size={size}
        disabled={isDisabled || isExporting}
        className="d-flex align-items-center"
        id="export-dropdown-toggle"
      >
        {isExporting ? (
          <>
            <Spinner
              as="span"
              animation="border"
              size="sm"
              role="status"
              aria-hidden="true"
              className="me-1"
            />
            Exporting...
          </>
        ) : (
          <>
            <i className="bi bi-download me-1"></i>
            Export
          </>
        )}
      </Dropdown.Toggle>

      <Dropdown.Menu align="end" rootCloseEvent="click">
        <Dropdown.Header>Export Options</Dropdown.Header>
        
        {exportOptions.map(option => (
          <Dropdown.Item
            key={option.format}
            onClick={() => handleExport(option.format)}
            disabled={isExporting}
            eventKey={option.format}
          >
            <i className={`bi bi-${option.icon} me-2`}></i>
            {option.label}
          </Dropdown.Item>
        ))}

        {exportOptions.length === 0 && (
          <Dropdown.Item disabled>
            <i className="bi bi-exclamation-triangle me-2"></i>
            No export options available
          </Dropdown.Item>
        )}
      </Dropdown.Menu>

    </Dropdown>
  );
};

ExportButton.propTypes = {
  // Data exports
  data: (props, propName) => {
    if (props[propName] && !Array.isArray(props[propName])) {
      return new Error('data must be an array');
    }
  },
  filename: (props, propName) => {
    if (props[propName] && typeof props[propName] !== 'string') {
      return new Error('filename must be a string');
    }
  },
  
  // Chart exports
  chartElementId: (props, propName) => {
    if (props[propName] && typeof props[propName] !== 'string') {
      return new Error('chartElementId must be a string');
    }
  },
  
  // Insights exports
  insights: (props, propName) => {
    if (props[propName] && typeof props[propName] !== 'object') {
      return new Error('insights must be an object');
    }
  }
};

export default ExportButton;
