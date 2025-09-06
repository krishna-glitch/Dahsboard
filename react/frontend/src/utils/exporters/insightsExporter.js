/**
 * Insights Exporter with lazy-loaded PDF support
 * Heavy PDF dependency (jsPDF) only loaded when needed
 */

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

  static async exportInsights(insights, filename, format, metadata = {}) {
    try {
      const report = this.generateInsightsReport(insights, metadata);
      
      switch (format) {
        case 'json':
          return this.exportAsJSON(report, filename);
        case 'csv': {
          // Flatten insights for CSV export
          const flattenedData = this.flattenInsightsForCSV(report);
          return this.exportAsCSV(flattenedData, filename);
        }
        case 'pdf':
          return await this.exportInsightsAsPDF(report, filename);
        default:
          throw new Error(`Unsupported insights export format: ${format}`);
      }
    } catch (error) {
      throw new Error(`Insights export failed: ${error.message}`);
    }
  }

  static exportAsJSON(data, filename) {
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
  }

  static exportAsCSV(data, filename) {
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('No data to export');
    }

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
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
      // Lazy load jsPDF only when needed for PDF export
      const jsPDF = await import('jspdf').then(module => module.default);
      
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