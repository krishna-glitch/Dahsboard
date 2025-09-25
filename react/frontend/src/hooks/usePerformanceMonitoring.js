import { useEffect, useRef, useCallback } from 'react';
import performanceMonitor from '../utils/performanceMonitor';

/**
 * Custom hook for performance monitoring in React components
 */
export const usePerformanceMonitoring = (componentName) => {
  const renderStartTime = useRef(null);
  const componentMounted = useRef(false);

  // Track component mount/unmount
  useEffect(() => {
    const mountTime = performance.now();
    componentMounted.current = true;
    
    performanceMonitor.recordMetric('component_mount', mountTime, {
      component: componentName
    });

    return () => {
      componentMounted.current = false;
      const unmountTime = performance.now();
      const lifetimeMs = unmountTime - mountTime;
      
      performanceMonitor.recordMetric('component_lifetime', lifetimeMs, {
        component: componentName
      });
    };
  }, [componentName]);

  // Track render performance
  const trackRender = useCallback(() => {
    if (!componentMounted.current) return;
    
    const renderTime = performance.now();
    if (renderStartTime.current) {
      const duration = renderTime - renderStartTime.current;
      performanceMonitor.trackComponentRender(componentName, duration);
    }
    renderStartTime.current = renderTime;
  }, [componentName]);

  // Track API calls
  const trackApiCall = useCallback((endpoint, method, promise) => {
    const startTime = performance.now();
    
    return promise
      .then((response) => {
        const duration = performance.now() - startTime;
        const status = response.__httpStatus || response.status || 200;
        // Avoid expensive stringify for large payloads; estimate size via record counts
        let dataSize = 0;
        try {
          if (response && typeof response === 'object') {
            const arr = response.water_quality_data || response.redox_data || response.sites || response.data;
            if (Array.isArray(arr)) {
              dataSize = arr.length;
            } else {
              const json = JSON.stringify(response);
              dataSize = json.length <= 100000 ? json.length : arr?.length || 0; // cap cost
            }
          }
        } catch {
          dataSize = 0;
        }
        
        performanceMonitor.trackApiCall(endpoint, method, duration, status, dataSize);
        return response;
      })
      .catch((error) => {
        const duration = performance.now() - startTime;
        performanceMonitor.trackApiCall(endpoint, method, duration, 'error', 0);
        
        // Report API error
        performanceMonitor.reportError('api_error', {
          endpoint,
          method,
          error: error.message,
          component: componentName
        });
        
        throw error;
      });
  }, [componentName]);

  // Track user interactions
  const trackInteraction = useCallback((action, element) => {
    const startTime = performance.now();
    
    return () => {
      const duration = performance.now() - startTime;
      performanceMonitor.trackInteraction(action, element, duration);
    };
  }, []);

  // Track timing for custom operations
  const trackTiming = useCallback((operationName) => {
    const operation = `${componentName}_${operationName}`;
    return {
      start: () => performanceMonitor.startTiming(operation),
      end: (metadata) => performanceMonitor.endTiming(operation, {
        component: componentName,
        ...metadata
      })
    };
  }, [componentName]);

  // Track data processing operations
  const trackDataProcessing = useCallback((dataSize, processingFunction) => {
    const startTime = performance.now();
    
    try {
      const result = processingFunction();
      const duration = performance.now() - startTime;
      
      performanceMonitor.recordMetric('data_processing', duration, {
        component: componentName,
        dataSize,
        throughput: dataSize / duration
      });
      
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      
      performanceMonitor.reportError('data_processing_error', {
        component: componentName,
        dataSize,
        duration,
        error: error.message
      });
      
      throw error;
    }
  }, [componentName]);

  return {
    trackRender,
    trackApiCall,
    trackInteraction,
    trackTiming,
    trackDataProcessing
  };
};

/**
 * Hook for tracking data loading performance
 */
export const useDataLoadingPerformance = (componentName) => {
  const { trackApiCall, trackTiming } = usePerformanceMonitoring(componentName);
  
  const trackDataFetch = useCallback(async (fetchFunction, dataType = 'unknown') => {
    const timer = trackTiming(`data_fetch_${dataType}`);
    timer.start();
    
    try {
      const result = await fetchFunction();
      timer.end({
        dataType,
        success: true,
        recordCount: Array.isArray(result) ? result.length : 1
      });
      
      return result;
    } catch (error) {
      timer.end({
        dataType,
        success: false,
        error: error.message
      });
      throw error;
    }
  }, [trackTiming]);

  return {
    trackDataFetch,
    trackApiCall,
    trackTiming
  };
};

/**
 * Hook for tracking chart rendering performance
 */
export const useChartPerformance = (componentName, chartType) => {
  const { trackTiming } = usePerformanceMonitoring(componentName);
  
  const trackChartRender = useCallback((dataPoints, renderFunction) => {
    const timer = trackTiming(`chart_render_${chartType}`);
    timer.start();
    
    try {
      const result = renderFunction();
      timer.end({
        chartType,
        dataPoints,
        success: true
      });
      
      return result;
    } catch (error) {
      timer.end({
        chartType,
        dataPoints,
        success: false,
        error: error.message
      });
      
      performanceMonitor.reportError('chart_render_error', {
        component: componentName,
        chartType,
        dataPoints,
        error: error.message
      });
      
      throw error;
    }
  }, [componentName, chartType, trackTiming]);

  return {
    trackChartRender,
    trackTiming
  };
};

export default usePerformanceMonitoring;
