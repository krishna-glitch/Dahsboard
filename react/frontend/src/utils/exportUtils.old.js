/**
 * Export Utilities for Charts and Data Insights
 * Provides comprehensive export functionality across all pages
 */

import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// Export formats
export const EXPORT_FORMATS = {
  PNG: 'png',
  JPG: 'jpg', 
  PDF: 'pdf',
  CSV: 'csv',
  JSON: 'json',
  EXCEL: 'excel'
};

// Chart export utility
export class ChartExporter {
  static async exportChart(elementId, filename, format = EXPORT_FORMATS.PNG) {
    const element = document.getElementById(elementId) || document.querySelector(`[data-chart-id="${elementId}"]`);
    
    if (!element) {
      throw new Error(`Chart element with ID "${elementId}" not found`);
    }

    switch (format) {
      case EXPORT_FORMATS.PNG:
        return await this.exportAsPNG(element, filename);
      case EXPORT_FORMATS.JPG:
        return await this.exportAsJPG(element, filename);
      case EXPORT_FORMATS.PDF:
        return await this.exportAsPDF(element, filename);
      default:
        throw new Error(`Unsupported chart export format: ${format}`);
    }
  }

  static async exportAsPNG(element, filename) {
    try {
      const canvas = await html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        useCORS: true
      });

      const link = document.createElement('a');
      link.download = `${filename}.png`;
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      return { success: true, format: 'PNG', filename: `${filename}.png` };
    } catch (error) {
      throw new Error(`PNG export failed: ${error.message}`);
    }
  }

  static async exportAsJPG(element, filename) {
    try {
      const canvas = await html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        useCORS: true
      });

      const link = document.createElement('a');
      link.download = `${filename}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      return { success: true, format: 'JPG', filename: `${filename}.jpg` };
    } catch (error) {
      throw new Error(`JPG export failed: ${error.message}`);
    }
  }

  static async exportAsPDF(element, filename) {
    try {
      const canvas = await html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        useCORS: true
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
        unit: 'mm'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${filename}.pdf`);

      return { success: true, format: 'PDF', filename: `${filename}.pdf` };
    } catch (error) {
      throw new Error(`PDF export failed: ${error.message}`);
    }
  }
}

// Data export utility
export class DataExporter {
  static exportAsCSV(data, filename, columns = null) {
    try {
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('No data to export');
      }

      const headers = columns || Object.keys(data[0]);
      const csvContent = [
        headers.join(','),
        ...data.map(row => 
          headers.map(header => {
            const value = row[header];
            // Handle values with commas or quotes
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value ?? '';
          }).join(',')
        )
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      return { success: true, format: 'CSV', filename: `${filename}.csv`, rows: data.length };
    } catch (error) {
      throw new Error(`CSV export failed: ${error.message}`);
    }
  }

  static exportAsJSON(data, filename) {
    try {
      const jsonContent = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      return { success: true, format: 'JSON', filename: `${filename}.json` };
    } catch (error) {
      throw new Error(`JSON export failed: ${error.message}`);
    }
  }

  static exportAsExcel(data, filename) {
    try {
      // Create a simple Excel-compatible CSV with UTF-8 BOM for proper Excel import
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('No data to export');
      }

      const headers = Object.keys(data[0]);
      
      // Create CSV content with proper Excel formatting
      const csvRows = [
        headers.join(','), // Header row
        ...data.map(row => 
          headers.map(header => {
            let value = row[header];
            
            // Handle different data types for Excel compatibility
            if (value === null || value === undefined) {
              return '';
            }
            
            // Format dates for Excel
            if (value instanceof Date) {
              value = value.toISOString().split('T')[0]; // YYYY-MM-DD format
            }
            
            // Handle strings with commas, quotes, or newlines
            if (typeof value === 'string') {
              if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                return `"${value.replace(/"/g, '""')}"`;
              }
            }
            
            return value;
          }).join(',')
        )
      ];
      
      const csvContent = csvRows.join('\n');
      
      // Add UTF-8 BOM for proper Excel recognition
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { 
        type: 'text/csv;charset=utf-8;' 
      });
      
      // Create download link with .csv extension (Excel will recognize it)
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.csv`;
      link.style.display = 'none';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      return { 
        success: true, 
        format: 'Excel-compatible CSV', 
        filename: `${filename}.csv`, 
        rows: data.length 
      };
    } catch (error) {
      throw new Error(`Excel export failed: ${error.message}`);
    }
  }
}

// Insights export utility
export class InsightsExporter {
  static generateInsightsReport(insights, metadata = {}) {
    const timestamp = new Date().toISOString();
    
    return {
      metadata: {
        title: metadata.title || 'Data Insights Report',
        generatedAt: timestamp,
        version: '1.0.0',
        ...metadata
      },
      insights,
      summary: this.generateSummary(insights),
      recommendations: this.generateRecommendations(insights)
    };
  }

  static generateSummary(insights) {
    const summary = {
      totalDataPoints: 0,
      keyFindings: [],
      dataQuality: 'Unknown',
      coverage: {}
    };

    // Analyze insights to generate summary
    if (insights.metrics) {
      Object.entries(insights.metrics).forEach(([, value]) => {
        if (typeof value === 'number') {
          summary.totalDataPoints += value;
        }
      });
    }

    if (insights.performance) {
      summary.keyFindings.push(
        `Performance optimization: ${insights.performance.improvement || 'N/A'}`
      );
    }

    return summary;
  }

  static generateRecommendations(insights) {
    const recommendations = [];

    // Generate contextual recommendations based on insights
    if (insights.alerts && insights.alerts.length > 0) {
      recommendations.push({
        type: 'alert',
        priority: 'high',
        message: `${insights.alerts.length} active alerts require attention`
      });
    }

    if (insights.dataQuality && insights.dataQuality < 90) {
      recommendations.push({
        type: 'quality',
        priority: 'medium',
        message: 'Data quality could be improved through additional validation'
      });
    }

    if (insights.performance && insights.performance.slowQueries > 0) {
      recommendations.push({
        type: 'performance',
        priority: 'low',
        message: 'Consider optimizing slow-performing queries'
      });
    }

    return recommendations;
  }

  static async exportInsights(insights, filename, format = EXPORT_FORMATS.JSON, metadata = {}) {
    try {
      const report = this.generateInsightsReport(insights, metadata);
      
      switch (format) {
        case EXPORT_FORMATS.JSON:
          return DataExporter.exportAsJSON(report, filename);
        case EXPORT_FORMATS.CSV: {
          // Flatten insights for CSV export
          const flattenedData = this.flattenInsightsForCSV(report);
          return DataExporter.exportAsCSV(flattenedData, filename);
        }
        case EXPORT_FORMATS.PDF:
          return await this.exportInsightsAsPDF(report, filename);
        default:
          throw new Error(`Unsupported insights export format: ${format}`);
      }
    } catch (error) {
      throw new Error(`Insights export failed: ${error.message}`);
    }
  }

  static flattenInsightsForCSV(report) {
    const flattened = [];
    
    // Add metadata
    Object.entries(report.metadata).forEach(([key, value]) => {
      flattened.push({ category: 'metadata', key, value: String(value) });
    });

    // Add insights
    if (report.insights) {
      Object.entries(report.insights).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          Object.entries(value).forEach(([subKey, subValue]) => {
            flattened.push({ 
              category: 'insights', 
              key: `${key}.${subKey}`, 
              value: String(subValue) 
            });
          });
        } else {
          flattened.push({ category: 'insights', key, value: String(value) });
        }
      });
    }

    // Add recommendations
    report.recommendations.forEach((rec, index) => {
      flattened.push({
        category: 'recommendation',
        key: `recommendation_${index + 1}`,
        value: `[${rec.priority}] ${rec.message}`
      });
    });

    return flattened;
  }

  static async exportInsightsAsPDF(report, filename) {
    try {
      const pdf = new jsPDF();
      let yPosition = 20;
      
      // Title
      pdf.setFontSize(16);
      pdf.text(report.metadata.title, 20, yPosition);
      yPosition += 20;
      
      // Metadata
      pdf.setFontSize(12);
      pdf.text(`Generated: ${new Date(report.metadata.generatedAt).toLocaleString()}`, 20, yPosition);
      yPosition += 15;
      
      // Summary
      pdf.setFontSize(14);
      pdf.text('Summary', 20, yPosition);
      yPosition += 10;
      
      pdf.setFontSize(10);
      pdf.text(`Total Data Points: ${report.summary.totalDataPoints}`, 20, yPosition);
      yPosition += 8;
      pdf.text(`Data Quality: ${report.summary.dataQuality}`, 20, yPosition);
      yPosition += 15;
      
      // Key Findings
      if (report.summary.keyFindings.length > 0) {
        pdf.setFontSize(14);
        pdf.text('Key Findings', 20, yPosition);
        yPosition += 10;
        
        pdf.setFontSize(10);
        report.summary.keyFindings.forEach(finding => {
          pdf.text(`• ${finding}`, 25, yPosition);
          yPosition += 8;
        });
        yPosition += 10;
      }
      
      // Recommendations
      if (report.recommendations.length > 0) {
        pdf.setFontSize(14);
        pdf.text('Recommendations', 20, yPosition);
        yPosition += 10;
        
        pdf.setFontSize(10);
        report.recommendations.forEach(rec => {
          pdf.text(`• [${rec.priority.toUpperCase()}] ${rec.message}`, 25, yPosition);
          yPosition += 8;
          
          // Handle page overflow
          if (yPosition > 270) {
            pdf.addPage();
            yPosition = 20;
          }
        });
      }
      
      pdf.save(`${filename}.pdf`);
      return { success: true, format: 'PDF', filename: `${filename}.pdf` };
    } catch (error) {
      throw new Error(`PDF insights export failed: ${error.message}`);
    }
  }
}

// Batch export utility
export class BatchExporter {
  static async exportMultiple(exports, progressCallback = null) {
    const results = [];
    const total = exports.length;
    
    for (let i = 0; i < exports.length; i++) {
      const exportConfig = exports[i];
      
      try {
        let result;
        
        switch (exportConfig.type) {
          case 'chart':
            result = await ChartExporter.exportChart(
              exportConfig.elementId,
              exportConfig.filename,
              exportConfig.format
            );
            break;
          case 'data':
            result = DataExporter.exportAsCSV(
              exportConfig.data,
              exportConfig.filename,
              exportConfig.columns
            );
            break;
          case 'insights':
            result = await InsightsExporter.exportInsights(
              exportConfig.insights,
              exportConfig.filename,
              exportConfig.format,
              exportConfig.metadata
            );
            break;
          default:
            throw new Error(`Unknown export type: ${exportConfig.type}`);
        }
        
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
}

// Data processing utilities
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

// Utility functions
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

// Export all utilities
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