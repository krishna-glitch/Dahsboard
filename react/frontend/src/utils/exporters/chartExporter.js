/**
 * Lazy-loaded Chart Exporter
 * Heavy dependencies (html2canvas, jsPDF) only loaded when needed
 */

export class ChartExporter {
  static async exportChart(elementId, filename, format) {
    const element = document.getElementById(elementId) || document.querySelector(`[data-chart-id="${elementId}"]`);
    
    if (!element) {
      throw new Error(`Chart element with ID "${elementId}" not found`);
    }

    switch (format) {
      case 'png':
        return await this.exportAsPNG(element, filename);
      case 'jpg':
        return await this.exportAsJPG(element, filename);
      case 'pdf':
        return await this.exportAsPDF(element, filename);
      default:
        throw new Error(`Unsupported chart export format: ${format}`);
    }
  }

  static async exportAsPNG(element, filename) {
    try {
      // Lazy load html2canvas only when needed
      const html2canvas = await import('html2canvas').then(module => module.default);
      
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
      // Lazy load html2canvas only when needed
      const html2canvas = await import('html2canvas').then(module => module.default);
      
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
      // Lazy load both dependencies only when needed
      const [html2canvas, jsPDF] = await Promise.all([
        import('html2canvas').then(module => module.default),
        import('jspdf').then(module => module.default)
      ]);
      
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