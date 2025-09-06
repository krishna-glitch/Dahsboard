/**
 * Client-Side Performance Monitoring Utility
 * Complements backend performance tracking with frontend metrics
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.observers = [];
    this.isEnabled = true;
    this.sessionId = this.generateSessionId();
    this.startTime = performance.now();
    
    // Initialize performance observer if available
    this.initializeObservers();
    
    // Track page load metrics
    this.trackPageLoad();
    
    console.log('🚀 Performance Monitor initialized');
  }

  generateSessionId() {
    return `perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Initialize Performance Observers for advanced metrics
   */
  initializeObservers() {
    if (!window.PerformanceObserver) {
      console.warn('PerformanceObserver not supported');
      return;
    }

    try {
      // Largest Contentful Paint (LCP)
      const lcpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordMetric('lcp', entry.startTime, {
            url: entry.url,
            element: entry.element?.tagName
          });
        }
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
      this.observers.push(lcpObserver);

      // First Input Delay (FID)
      const fidObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordMetric('fid', entry.processingStart - entry.startTime, {
            name: entry.name,
            duration: entry.duration
          });
        }
      });
      fidObserver.observe({ entryTypes: ['first-input'] });
      this.observers.push(fidObserver);

      // Cumulative Layout Shift (CLS)
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        }
        this.recordMetric('cls', clsValue);
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
      this.observers.push(clsObserver);

      // Long Tasks (performance bottlenecks)
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordMetric('long_task', entry.duration, {
            name: entry.name,
            startTime: entry.startTime
          });
        }
      });
      longTaskObserver.observe({ entryTypes: ['longtask'] });
      this.observers.push(longTaskObserver);

    } catch (error) {
      console.warn('Failed to initialize performance observers:', error);
    }
  }

  /**
   * Track page load performance metrics
   */
  trackPageLoad() {
    if (document.readyState === 'complete') {
      this.measurePageLoad();
    } else {
      window.addEventListener('load', () => this.measurePageLoad());
    }
  }

  measurePageLoad() {
    if (!performance.timing) return;

    const timing = performance.timing;
    const navigation = performance.navigation;

    const metrics = {
      dns_lookup: timing.domainLookupEnd - timing.domainLookupStart,
      tcp_connection: timing.connectEnd - timing.connectStart,
      server_response: timing.responseStart - timing.requestStart,
      dom_processing: timing.domComplete - timing.domLoading,
      page_load: timing.loadEventEnd - timing.navigationStart,
      dom_ready: timing.domContentLoadedEventEnd - timing.navigationStart,
      navigation_type: navigation.type,
      redirect_count: navigation.redirectCount
    };

    for (const [key, value] of Object.entries(metrics)) {
      this.recordMetric(`page_load_${key}`, value);
    }
  }

  /**
   * Start timing a custom operation
   */
  startTiming(operation) {
    if (!this.isEnabled) return;
    
    this.metrics.set(`${operation}_start`, performance.now());
    return operation;
  }

  /**
   * End timing a custom operation
   */
  endTiming(operation, metadata = {}) {
    if (!this.isEnabled) return;
    
    const startTime = this.metrics.get(`${operation}_start`);
    if (startTime === undefined) {
      console.warn(`No start time found for operation: ${operation}`);
      return;
    }

    const duration = performance.now() - startTime;
    this.recordMetric(operation, duration, metadata);
    
    // Clean up start time
    this.metrics.delete(`${operation}_start`);
    
    return duration;
  }

  /**
   * Record a performance metric
   */
  recordMetric(name, value, metadata = {}) {
    if (!this.isEnabled) return;

    const metric = {
      name,
      value,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      url: window.location.pathname,
      userAgent: navigator.userAgent,
      ...metadata
    };

    // Store in memory
    const metricKey = `${name}_${metric.timestamp}`;
    this.metrics.set(metricKey, metric);

    // Temporarily disable logging to reduce console noise
    // if (this.isSignificantMetric(name, value)) {
    //   console.log(`📊 [PERF] ${name}: ${this.formatValue(name, value)}`, metadata);
    // }

    // Send to backend if configured
    this.sendToBackend(metric);

    return metric;
  }

  /**
   * Report application errors with performance context
   */
  reportError(errorType, errorData) {
    const errorMetric = {
      type: 'error',
      errorType,
      ...errorData,
      sessionId: this.sessionId,
      timestamp: Date.now(),
      url: window.location.pathname,
      memoryUsage: this.getMemoryUsage(),
      connectionType: this.getConnectionType()
    };

    console.error('🚨 [PERF ERROR]', errorMetric);
    this.sendToBackend(errorMetric);
  }

  /**
   * Track React component performance
   */
  trackComponentRender(componentName, renderTime, props = {}) {
    this.recordMetric('component_render', renderTime, {
      component: componentName,
      propsCount: Object.keys(props).length,
      hasChildren: !!props.children
    });
  }

  /**
   * Track API call performance
   */
  trackApiCall(endpoint, method, duration, status, dataSize = 0) {
    this.recordMetric('api_call', duration, {
      endpoint,
      method,
      status,
      dataSize,
      throughput: dataSize / duration
    });
  }

  /**
   * Track user interactions
   */
  trackInteraction(action, element, duration = 0) {
    this.recordMetric('user_interaction', duration, {
      action,
      element: element?.tagName || element,
      timestamp: Date.now()
    });
  }

  /**
   * Get current performance summary
   */
  getSummary() {
    const summary = {
      sessionId: this.sessionId,
      sessionDuration: performance.now() - this.startTime,
      metricsCount: this.metrics.size,
      memoryUsage: this.getMemoryUsage(),
      connectionType: this.getConnectionType(),
      timestamp: Date.now()
    };

    // Calculate averages for key metrics
    const keyMetrics = ['api_call', 'component_render', 'lcp', 'fid'];
    keyMetrics.forEach(metric => {
      const values = Array.from(this.metrics.values())
        .filter(m => m.name === metric)
        .map(m => m.value);
      
      if (values.length > 0) {
        summary[`${metric}_avg`] = values.reduce((a, b) => a + b, 0) / values.length;
        summary[`${metric}_count`] = values.length;
      }
    });

    return summary;
  }

  /**
   * Export metrics for analysis
   */
  exportMetrics() {
    return {
      sessionId: this.sessionId,
      startTime: this.startTime,
      metrics: Array.from(this.metrics.entries()),
      summary: this.getSummary()
    };
  }

  /**
   * Check if a metric is significant enough to log
   */
  isSignificantMetric(name, value) {
    const thresholds = {
      'api_call': 1000, // Log API calls > 1s
      'component_render': 100, // Log renders > 100ms
      'lcp': 2500, // Log LCP > 2.5s
      'fid': 100, // Log FID > 100ms
      'long_task': 50 // Log tasks > 50ms
    };

    return value > (thresholds[name] || Infinity);
  }

  /**
   * Format metric values for logging
   */
  formatValue(name, value) {
    const timeMetrics = ['api_call', 'component_render', 'lcp', 'fid', 'long_task', 'page_load'];
    if (timeMetrics.some(metric => name.includes(metric))) {
      return `${value.toFixed(2)}ms`;
    }
    return value.toString();
  }

  /**
   * Get memory usage information
   */
  getMemoryUsage() {
    if (performance.memory) {
      return {
        used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
        total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
        limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
      };
    }
    return null;
  }

  /**
   * Get network connection information
   */
  getConnectionType() {
    if (navigator.connection) {
      return {
        effectiveType: navigator.connection.effectiveType,
        downlink: navigator.connection.downlink,
        rtt: navigator.connection.rtt
      };
    }
    return null;
  }

  /**
   * Send metrics to backend
   */
  sendToBackend(metric) {
    // Batch metrics to avoid overwhelming the backend
    if (!this.batchedMetrics) {
      this.batchedMetrics = [];
      setTimeout(() => this.flushMetrics(), 5000); // Flush every 5 seconds
    }

    this.batchedMetrics.push(metric);

    // Immediate send for errors
    if (metric.type === 'error') {
      this.flushMetrics(true);
    }
  }

  /**
   * Flush batched metrics to backend
   */
  async flushMetrics(immediate = false) {
    if (!this.batchedMetrics || this.batchedMetrics.length === 0) return;

    try {
      const payload = {
        sessionId: this.sessionId,
        metrics: this.batchedMetrics,
        timestamp: Date.now()
      };

      // Send to Flask backend performance endpoint
      await fetch('/api/v1/performance/client-metrics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      // Temporarily disabled to reduce network overhead
      // console.log(`📊 Sent ${this.batchedMetrics.length} metrics to backend`);
      this.batchedMetrics = [];

    } catch (error) {
      console.warn('Failed to send metrics to backend:', error);
      // Keep metrics for retry
      if (immediate) {
        this.batchedMetrics = [];
      }
    }
  }

  /**
   * Disable performance monitoring
   */
  disable() {
    this.isEnabled = false;
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    console.log('Performance monitoring disabled');
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.flushMetrics(true);
    this.disable();
    this.metrics.clear();
  }
}

// Create global instance
const performanceMonitor = new PerformanceMonitor();

// Export for use in components
export default performanceMonitor;

// Make available globally for error boundaries
window.performanceMonitor = performanceMonitor;

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  performanceMonitor.cleanup();
});

export { PerformanceMonitor };