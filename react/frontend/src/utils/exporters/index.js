/**
 * Lazy-loaded Export System
 * Main entry point that dynamically imports exporters only when needed
 */

// Lightweight utilities that can be imported immediately
export const EXPORT_FORMATS = {
  PNG: 'png',
  JPG: 'jpg', 
  PDF: 'pdf',
  CSV: 'csv',
  JSON: 'json',
  EXCEL: 'excel'
};

// Utility functions (no heavy dependencies)
export const formatFilename = (baseName, suffix = '', timestamp = true) => {
  const clean = baseName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const time = timestamp ? `_${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}` : '';
  const suf = suffix ? `_${suffix}` : '';
  return `${clean}${suf}${time}`;
};

export const validateExportData = (data) => {
  if (!data) return { valid: false, error: 'No data provided' };
  if (Array.isArray(data) && data.length === 0) return { valid: false, error: 'Empty data array' };
  return { valid: true };
};

// Lazy-loaded exporters - only imported when needed
export const lazyExporters = {
  // Chart exports (heavy: html2canvas + jsPDF)
  async getChartExporter() {
    const { ChartExporter } = await import('./chartExporter.js');
    return ChartExporter;
  },

  // Data exports (lightweight: pure JS)
  async getDataExporter() {
    const { DataExporter } = await import('./dataExporter.js');
    return DataExporter;
  },

  // Insights exports (medium: jsPDF for PDF only)
  async getInsightsExporter() {
    const { InsightsExporter } = await import('./insightsExporter.js');
    return InsightsExporter;
  }
};

// Main export function with dynamic loading
export async function performExport(exportConfig) {
  const { type, format, filename, ...options } = exportConfig;

  try {
    let result;
    const exportFilename = formatFilename(filename);

    switch (type) {
      case 'chart': {
        const ChartExporter = await lazyExporters.getChartExporter();
        result = await ChartExporter.exportChart(
          options.elementId,
          exportFilename,
          format
        );
        break;
      }

      case 'data': {
        const DataExporter = await lazyExporters.getDataExporter();
        
        if (format === EXPORT_FORMATS.CSV) {
          result = DataExporter.exportAsCSV(options.data, exportFilename, options.columns);
        } else if (format === EXPORT_FORMATS.JSON) {
          result = DataExporter.exportAsJSON(options.data, exportFilename);
        } else if (format === EXPORT_FORMATS.EXCEL) {
          result = DataExporter.exportAsExcel(options.data, exportFilename);
        } else {
          throw new Error(`Unsupported data export format: ${format}`);
        }
        break;
      }

      case 'insights': {
        const InsightsExporter = await lazyExporters.getInsightsExporter();
        result = await InsightsExporter.exportInsights(
          options.insights,
          exportFilename,
          format,
          options.metadata || {}
        );
        break;
      }

      default:
        throw new Error(`Unknown export type: ${type}`);
    }

    return result;
  } catch (error) {
    throw new Error(`Export failed: ${error.message}`);
  }
}

// Batch export with progress tracking
export async function performBatchExport(exports, progressCallback = null) {
  const results = [];
  const total = exports.length;
  
  for (let i = 0; i < exports.length; i++) {
    const exportConfig = exports[i];
    
    try {
      const result = await performExport(exportConfig);
      results.push({ ...result, config: exportConfig });
      
      if (progressCallback) {
        progressCallback({ current: i + 1, total, result });
      }
    } catch (error) {
      results.push({ 
        success: false, 
        error: error.message, 
        config: exportConfig 
      });
    }
  }
  
  return {
    total,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results
  };
}

// Legacy compatibility exports (will be dynamically loaded)
export const ChartExporter = {
  exportChart: async (...args) => {
    const ChartExporter = await lazyExporters.getChartExporter();
    return ChartExporter.exportChart(...args);
  }
};

export const DataExporter = {
  exportAsCSV: async (...args) => {
    const DataExporter = await lazyExporters.getDataExporter();
    return DataExporter.exportAsCSV(...args);
  },
  exportAsJSON: async (...args) => {
    const DataExporter = await lazyExporters.getDataExporter();
    return DataExporter.exportAsJSON(...args);
  },
  exportAsExcel: async (...args) => {
    const DataExporter = await lazyExporters.getDataExporter();
    return DataExporter.exportAsExcel(...args);
  }
};

export const InsightsExporter = {
  exportInsights: async (...args) => {
    const InsightsExporter = await lazyExporters.getInsightsExporter();
    return InsightsExporter.exportInsights(...args);
  }
};