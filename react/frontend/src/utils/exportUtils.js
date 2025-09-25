/**
 * LEGACY COMPATIBILITY LAYER
 * 
 * This file provides backward compatibility for existing imports.
 * It re-exports from the new lazy-loaded system.
 * 
 * TODO: Eventually migrate all imports to use the new exporters directly.
 */

// Import from the new lazy system to make them available in this module
import {
  EXPORT_FORMATS,
  formatFilename,
  validateExportData,
  ChartExporter,
  DataExporter,
  InsightsExporter,
  performExport,
  performBatchExport
} from './exporters';

// Re-export everything for other modules that use this legacy file
export {
  EXPORT_FORMATS,
  formatFilename,
  validateExportData,
  ChartExporter,
  DataExporter,
  InsightsExporter,
  performExport,
  performBatchExport
};

// Legacy data processing utilities (lightweight, can stay)
export class DataProcessor {
  static prepareDataForExport(data, options = {}) {
    const {
      formatDates = true,
      roundNumbers = 2,
      excludeColumns = [],
      customColumnNames = {}
    } = options;

    if (!Array.isArray(data) || data.length === 0) {
      return data;
    }

    return data.map(row => {
      const processedRow = {};
      
      Object.entries(row).forEach(([key, value]) => {
        // Skip excluded columns
        if (excludeColumns.includes(key)) return;
        
        // Use custom column name if provided
        const columnName = customColumnNames[key] || key;
        
        // Process the value based on type
        if (value === null || value === undefined) {
          processedRow[columnName] = '';
        } else if (typeof value === 'number') {
          // Round numbers if specified
          processedRow[columnName] = roundNumbers !== null 
            ? Number(value.toFixed(roundNumbers)) 
            : value;
        } else if (formatDates && (value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value))))) {
          // Format dates consistently
          const date = new Date(value);
          processedRow[columnName] = date.toISOString().replace('T', ' ').slice(0, 19);
        } else {
          processedRow[columnName] = value;
        }
      });
      
      return processedRow;
    });
  }

  static addExportMetadata(data, metadata = {}) {
    const timestamp = new Date().toISOString();
    const exportMetadata = {
      exported_at: timestamp,
      record_count: Array.isArray(data) ? data.length : 0,
      export_version: '1.0',
      ...metadata
    };

    return {
      metadata: exportMetadata,
      data: data
    };
  }

  static filterDataForExport(data, filters = {}) {
    if (!Array.isArray(data) || data.length === 0) return data;

    return data.filter(row => {
      return Object.entries(filters).every(([key, filterValue]) => {
        const rowValue = row[key];
        
        if (filterValue === null || filterValue === undefined) return true;
        
        // Handle different filter types
        if (typeof filterValue === 'object' && filterValue !== null) {
          const { min, max, includes, excludes } = filterValue;
          
          // Range filter
          if (min !== undefined || max !== undefined) {
            const numValue = Number(rowValue);
            if (min !== undefined && numValue < min) return false;
            if (max !== undefined && numValue > max) return false;
          }
          
          // Include/exclude filters
          if (includes && !includes.includes(rowValue)) return false;
          if (excludes && excludes.includes(rowValue)) return false;
        } else {
          // Simple equality filter
          return rowValue === filterValue;
        }
        
        return true;
      });
    });
  }
}

// Legacy batch exporter (now uses the new performBatchExport)
export const BatchExporter = {
  exportMultiple: performBatchExport
};

// Legacy utility functions
export const getExportSummary = (data, exportConfig = {}) => {
  if (!Array.isArray(data)) return null;
  
  const summary = {
    totalRecords: data.length,
    exportedAt: new Date().toISOString(),
    columns: data.length > 0 ? Object.keys(data[0]).length : 0,
    format: exportConfig.format || 'unknown',
    estimatedSize: estimateDataSize(data)
  };
  
  // Add column analysis
  if (data.length > 0) {
    const firstRow = data[0];
    summary.columnTypes = {};
    
    Object.entries(firstRow).forEach(([key, value]) => {
      const type = typeof value;
      summary.columnTypes[key] = type === 'object' && value instanceof Date ? 'date' : type;
    });
  }
  
  return summary;
};

// Helper function to estimate data size
const estimateDataSize = (data) => {
  if (!Array.isArray(data) || data.length === 0) return '0 B';
  
  // Rough estimation based on JSON string length
  const sampleSize = Math.min(10, data.length);
  const sampleJson = JSON.stringify(data.slice(0, sampleSize));
  const avgRowSize = sampleJson.length / sampleSize;
  const totalBytes = avgRowSize * data.length;
  
  // Format size
  const sizes = ['B', 'KB', 'MB', 'GB'];
  let size = totalBytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < sizes.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${sizes[unitIndex]}`;
};

// Default export for legacy compatibility
export default {
  ChartExporter,
  DataExporter,
  InsightsExporter,
  BatchExporter,
  DataProcessor,
  EXPORT_FORMATS,
  formatFilename,
  validateExportData,
  getExportSummary
};