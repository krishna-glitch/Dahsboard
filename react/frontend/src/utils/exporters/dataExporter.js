/**
 * Lightweight Data Exporter
 * No heavy dependencies - pure JavaScript implementations
 */

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