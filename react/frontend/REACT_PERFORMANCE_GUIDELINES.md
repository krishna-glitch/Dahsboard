# React Performance Guidelines & Best Practices

**Project**: Water Quality Monitoring Application  
**Last Updated**: 2025-09-06  
**Status**: Active Development Guidelines

## 🎯 Overview

This document provides mandatory guidelines for maintaining the performance optimizations implemented in our React application. **All developers must follow these patterns** to prevent performance regressions and maintain consistency.

## 🚨 Critical Rules - DO NOT VIOLATE

### ❌ NEVER DO THESE:

1. **Custom Caching Systems**
   ```javascript
   // ❌ DON'T: Custom cache implementations
   const [cache, setCache] = useState(new Map());
   const customCache = useMemo(() => new WeakMap(), []);
   
   // ✅ DO: Use React Query for all data caching
   const { data, isLoading } = useQuery({
     queryKey: ['water-quality', filters],
     queryFn: () => fetchWaterQuality(filters),
     staleTime: 5 * 60 * 1000 // 5 minutes
   });
   ```

2. **Inline Object/Function Creation in Render**
   ```javascript
   // ❌ DON'T: Inline objects in JSX
   <Component style={{ marginTop: 10 }} config={{ type: 'chart' }} />
   
   // ✅ DO: Extract to constants or useMemo
   const CHART_STYLE = { marginTop: 10 };
   const CHART_CONFIG = { type: 'chart' };
   <Component style={CHART_STYLE} config={CHART_CONFIG} />
   ```

3. **Missing React.memo for Presentational Components**
   ```javascript
   // ❌ DON'T: Unmemoized presentational components
   const MetricCard = ({ title, value }) => <div>...</div>;
   
   // ✅ DO: Always wrap presentational components
   const MetricCard = React.memo(({ title, value }) => <div>...</div>);
   ```

4. **Unstable Context Values**
   ```javascript
   // ❌ DON'T: Recreate context value on every render
   const value = { user, login, logout };
   
   // ✅ DO: Memoize context values
   const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);
   ```

## ✅ Mandatory Patterns

### 1. Data Fetching - React Query Only

**Template for all API calls:**
```javascript
// hooks/useWaterQualityData.js
export const useWaterQualityData = (filters) => {
  return useQuery({
    queryKey: ['water-quality', filters],
    queryFn: () => api.fetchWaterQuality(filters),
    staleTime: 5 * 60 * 1000,
    cacheTime: 10 * 60 * 1000,
    retry: 3,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000)
  });
};
```

### 2. Component Optimization Checklist

**Before creating any new component, check:**

- [ ] Is it presentational? → Wrap with `React.memo`
- [ ] Does it render lists? → Memoize list items
- [ ] Does it use context? → Memoize context value
- [ ] Does it have complex calculations? → Use `useMemo`
- [ ] Does it have event handlers? → Use `useCallback`
- [ ] Does it render >100 items? → Implement virtualization

### 3. Large Dataset Rendering

**For tables/lists with >100 items:**
```javascript
// Use our optimized DataTable with virtualization
<DataTable 
  data={data}
  columns={columns}
  virtualized={data.length > 200}
  maxHeight={500}
  rowHeight={45}
/>
```

### 4. Chart Components

**For Plotly charts:**
```javascript
// Use ProgressivePlot for large datasets
<ProgressivePlot
  data={chartData}
  layout={layout}
  threshold={1000} // Show skeleton for >1000 points
  batchSize={500}  // Render in batches
/>
```

## 🏗️ Component Architecture Patterns

### Presentational Components
```javascript
// Always memoize pure presentational components
const MetricCard = React.memo(({ title, value, icon, status }) => {
  return (
    <div className={`metric-card status-${status}`}>
      <Icon name={icon} />
      <h3>{title}</h3>
      <div className="value">{value}</div>
    </div>
  );
});
```

### Container Components
```javascript
// Use custom hooks for business logic
const WaterQualityDashboard = () => {
  const { data, isLoading, error } = useWaterQualityData(filters);
  const { sites } = useSiteData();
  
  const handleFilterChange = useCallback((newFilters) => {
    // Handle filter logic
  }, []);
  
  if (isLoading) return <SkeletonLoader type="dashboard" />;
  if (error) return <ErrorBoundary error={error} />;
  
  return (
    <DashboardLayout>
      <MetricGrid data={data} />
      <ChartSection data={data} />
    </DashboardLayout>
  );
};
```

### Custom Hooks Pattern
```javascript
// Extract reusable logic into custom hooks
export const useDebounced = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  
  return debouncedValue;
};
```

## 📊 Performance Monitoring

### Required Metrics to Track
```javascript
// Add to components that might have performance issues
const ComponentName = () => {
  useEffect(() => {
    console.log(`[PERF] ${ComponentName.name} mounted`);
    return () => console.log(`[PERF] ${ComponentName.name} unmounted`);
  }, []);
  
  // Component logic here
};
```

### Performance Testing Checklist
- [ ] Test with 10,000+ data points
- [ ] Test rapid filter changes (< 300ms response)
- [ ] Test table sorting with large datasets
- [ ] Monitor memory usage during navigation
- [ ] Check for memory leaks in dev tools

## 🔄 State Management Rules

### 1. Context Usage
```javascript
// ✅ DO: Memoize context values
const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  
  const value = useMemo(() => ({
    user,
    isAuthenticated: !!user,
    login,
    logout
  }), [user, login, logout]);
  
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
```

### 2. Form State
```javascript
// Use React Hook Form for complex forms
const WaterQualityForm = () => {
  const { register, handleSubmit, control } = useForm({
    defaultValues: DEFAULT_VALUES
  });
  
  const onSubmit = useCallback((data) => {
    // Handle submission
  }, []);
  
  return <form onSubmit={handleSubmit(onSubmit)}>...</form>;
};
```

## 🎨 Styling Best Practices

### CSS-in-JS Performance
```javascript
// ✅ DO: Extract static styles
const METRIC_CARD_STYLES = {
  container: {
    padding: 'var(--spacing-md)',
    borderRadius: 'var(--radius-lg)',
    backgroundColor: 'var(--surface-primary)'
  }
};

// ✅ DO: Use CSS modules for component styles
import styles from './MetricCard.module.css';
```

## 📱 Mobile & Responsive Performance

### Touch Interactions
```javascript
// Optimize for touch devices
const MobileOptimizedTable = () => {
  const [touchStart, setTouchStart] = useState(null);
  
  const handleTouchStart = useCallback((e) => {
    setTouchStart(e.touches[0].clientX);
  }, []);
  
  // Implement swipe gestures for better mobile UX
};
```

## 🧪 Testing Performance

### Performance Tests
```javascript
// Add performance tests for critical components
describe('DataTable Performance', () => {
  test('renders 1000 rows within 100ms', async () => {
    const startTime = performance.now();
    render(<DataTable data={generateLargeDataset(1000)} />);
    const endTime = performance.now();
    
    expect(endTime - startTime).toBeLessThan(100);
  });
});
```

## 🔧 Build Optimization

### Bundle Analysis
```bash
# Regularly analyze bundle size
npm run build
npm run analyze # Check if this exists, or add it
```

### Code Splitting
```javascript
// Implement route-based code splitting
const WaterQualityPage = lazy(() => import('./pages/WaterQualityPage'));
const RedoxAnalysisPage = lazy(() => import('./pages/RedoxAnalysisPage'));

// Wrap in Suspense
<Suspense fallback={<PageLoader />}>
  <WaterQualityPage />
</Suspense>
```

## 🚀 Production Optimizations

### Error Boundaries
```javascript
// Always wrap major sections in error boundaries
class PerformantErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }
  
  componentDidCatch(error, errorInfo) {
    console.error('Performance-related error:', error, errorInfo);
  }
  
  render() {
    if (this.state.hasError) {
      return <ErrorFallback onRetry={() => this.setState({ hasError: false })} />;
    }
    
    return this.props.children;
  }
}
```

## 📋 Pre-Commit Checklist

Before committing any new component or feature:

- [ ] All inline functions converted to `useCallback`
- [ ] All expensive calculations wrapped in `useMemo`
- [ ] Presentational components wrapped with `React.memo`
- [ ] No custom caching implementations (use React Query)
- [ ] Large lists use virtualization or pagination
- [ ] Context values are memoized
- [ ] Static objects extracted outside components
- [ ] Performance tested with realistic data volumes
- [ ] No console warnings about missing dependencies

## 🔍 Code Review Guidelines

### What to Look For:
1. **Anti-patterns**: Custom caches, inline objects, missing memoization
2. **Performance**: Large lists without virtualization, unmemoized expensive operations
3. **Memory leaks**: Missing cleanup in useEffect, event listeners not removed
4. **Bundle size**: Unnecessary imports, large dependencies

### Review Questions:
- Does this component re-render unnecessarily?
- Are we creating new objects/functions on every render?
- Is this the right place for this logic?
- Could this be optimized with React Query?
- Does this follow our established patterns?

## 📚 Quick Reference

### Performance Hooks:
- `useMemo` → Expensive calculations
- `useCallback` → Event handlers, function props
- `React.memo` → Presentational components
- `useQuery` → All data fetching
- `useDebounced` → Search inputs, filters

### Component Types:
- **Presentational** → Always memoize
- **Container** → Use custom hooks for logic
- **Forms** → React Hook Form
- **Tables** → DataTable with virtualization
- **Charts** → ProgressivePlot for large datasets

---

**Remember**: Performance is not optional. These guidelines ensure our application remains fast and responsive as it grows. When in doubt, ask the team or refer to this document.

**Questions?** Update this document when you discover new patterns or optimizations.