import React, { Component, forwardRef } from 'react';
import performanceMonitor from '../../utils/performanceMonitor';

/**
 * Higher-Order Component for automatic performance tracking
 * Wraps components to automatically track render performance and lifecycle
 */
export const withPerformanceTracking = (WrappedComponent, options = {}) => {
  const {
    trackProps = false,
    trackRenders = true,
    trackLifecycle = true,
    componentName = WrappedComponent.displayName || WrappedComponent.name || 'Component'
  } = options;

  class PerformanceTrackedComponent extends Component {
    constructor(props) {
      super(props);
      this.componentName = componentName;
      this.mountTime = null;
      this.renderCount = 0;
    }

    componentDidMount() {
      this.mountTime = performance.now();
      
      if (trackLifecycle) {
        performanceMonitor.recordMetric('component_mount', this.mountTime, {
          component: this.componentName,
          propsCount: trackProps ? Object.keys(this.props).length : undefined
        });
      }
    }

    componentDidUpdate(prevProps) {
      this.renderCount++;
      
      if (trackRenders) {
        performanceMonitor.recordMetric('component_update', performance.now(), {
          component: this.componentName,
          renderCount: this.renderCount,
          propsChanged: trackProps ? this.getChangedProps(prevProps, this.props) : undefined
        });
      }
    }

    componentWillUnmount() {
      if (trackLifecycle && this.mountTime) {
        const lifetime = performance.now() - this.mountTime;
        performanceMonitor.recordMetric('component_lifetime', lifetime, {
          component: this.componentName,
          totalRenders: this.renderCount
        });
      }
    }

    getChangedProps(prevProps, nextProps) {
      const changed = [];
      const allKeys = new Set([...Object.keys(prevProps), ...Object.keys(nextProps)]);
      
      for (const key of allKeys) {
        if (prevProps[key] !== nextProps[key]) {
          changed.push(key);
        }
      }
      
      return changed;
    }

    render() {
      const renderStart = performance.now();
      
      try {
        const result = (
          <WrappedComponent
            {...this.props}
            ref={this.props.forwardedRef}
          />
        );
        
        if (trackRenders) {
          const renderTime = performance.now() - renderStart;
          performanceMonitor.trackComponentRender(this.componentName, renderTime, this.props);
        }
        
        return result;
      } catch (error) {
        performanceMonitor.reportError('component_render_error', {
          component: this.componentName,
          error: error.message,
          stack: error.stack
        });
        throw error;
      }
    }
  }

  // Forward refs properly
  const ForwardedComponent = forwardRef((props, ref) => {
    return <PerformanceTrackedComponent {...props} forwardedRef={ref} />;
  });

  ForwardedComponent.displayName = `withPerformanceTracking(${componentName})`;
  
  return ForwardedComponent;
};

/**
 * Specialized HOC for data components
 */
export const withDataPerformanceTracking = (WrappedComponent, options = {}) => {
  return withPerformanceTracking(WrappedComponent, {
    trackProps: true,
    trackRenders: true,
    trackLifecycle: true,
    ...options
  });
};

/**
 * Specialized HOC for chart components
 */
export const withChartPerformanceTracking = (WrappedComponent, chartType, options = {}) => {
  class ChartPerformanceWrapper extends Component {
    componentDidMount() {
      performanceMonitor.recordMetric('chart_mount', performance.now(), {
        component: WrappedComponent.displayName || WrappedComponent.name,
        chartType
      });
    }

    componentDidUpdate() {
      performanceMonitor.recordMetric('chart_update', performance.now(), {
        component: WrappedComponent.displayName || WrappedComponent.name,
        chartType,
        dataLength: Array.isArray(this.props.data) ? this.props.data.length : 0
      });
    }

    render() {
      return <WrappedComponent {...this.props} />;
    }
  }

  return withPerformanceTracking(ChartPerformanceWrapper, {
    componentName: `${WrappedComponent.displayName || WrappedComponent.name}_Chart`,
    ...options
  });
};

export default withPerformanceTracking;