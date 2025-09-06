# React Performance Quick Reference

## 🚨 Before Adding Any Component

```bash
# Ask yourself these questions:
1. Is it presentational? → React.memo
2. Does it fetch data? → React Query
3. Does it render lists? → Virtualization if >100 items  
4. Does it have calculations? → useMemo
5. Does it have event handlers? → useCallback
```

## ✅ Copy-Paste Templates

### Presentational Component
```javascript
const ComponentName = React.memo(({ prop1, prop2 }) => {
  return (
    <div className="component-name">
      {/* JSX here */}
    </div>
  );
});
```

### Data Fetching Hook
```javascript
export const useComponentData = (filters) => {
  return useQuery({
    queryKey: ['component-data', filters],
    queryFn: () => api.fetchData(filters),
    staleTime: 5 * 60 * 1000,
    cacheTime: 10 * 60 * 1000
  });
};
```

### Container Component
```javascript
const ContainerComponent = () => {
  const { data, isLoading } = useComponentData(filters);
  
  const handleAction = useCallback((param) => {
    // Handle action
  }, []);
  
  if (isLoading) return <SkeletonLoader />;
  
  return <PresentationalComponent data={data} onAction={handleAction} />;
};
```

### Context with Memoization
```javascript
const ContextProvider = ({ children }) => {
  const [state, setState] = useState(initial);
  
  const value = useMemo(() => ({
    state,
    actions: { setState }
  }), [state, setState]);
  
  return <Context.Provider value={value}>{children}</Context.Provider>;
};
```

### Large List Component
```javascript
<DataTable 
  data={data}
  columns={columns}
  virtualized={data.length > 200}
  maxHeight={500}
  rowHeight={45}
/>
```

## ❌ Common Mistakes

```javascript
// ❌ DON'T DO THESE:

// Inline objects/functions
<Component style={{ margin: 10 }} onClick={() => doSomething()} />

// Custom caching
const [cache, setCache] = useState(new Map());

// Unmemoized context
const value = { user, login, logout }; // Recreated every render

// Missing React.memo on presentational components
const PureComponent = ({ data }) => <div>{data}</div>;

// Direct API calls in components
useEffect(() => { 
  fetch('/api/data').then(setData); 
}, []);
```

## 🎯 Quick Fixes

### Fix Inline Objects
```javascript
// ❌ Before
<Component config={{ type: 'chart', height: 300 }} />

// ✅ After  
const CHART_CONFIG = { type: 'chart', height: 300 };
<Component config={CHART_CONFIG} />
```

### Fix Inline Functions
```javascript
// ❌ Before
<Button onClick={() => handleClick(item.id)} />

// ✅ After
const handleItemClick = useCallback(() => handleClick(item.id), [item.id]);
<Button onClick={handleItemClick} />
```

### Fix Expensive Calculations
```javascript
// ❌ Before
const processedData = data.filter(item => item.active).map(transform);

// ✅ After
const processedData = useMemo(() => 
  data.filter(item => item.active).map(transform), 
  [data]
);
```

## 🔍 Debug Performance Issues

### React DevTools Profiler
1. Install React DevTools extension
2. Open Profiler tab
3. Record interaction
4. Look for unnecessary re-renders

### Console Debugging
```javascript
// Add to suspect components
useEffect(() => {
  console.log(`[RENDER] ${ComponentName.name} rendered`);
});
```

### Memory Leaks
```javascript
// Always cleanup in useEffect
useEffect(() => {
  const subscription = subscribe();
  return () => subscription.unsubscribe(); // ← Cleanup
}, []);
```

## 📊 Performance Targets

- **Initial page load**: < 2 seconds
- **Filter changes**: < 300ms response  
- **Table sorting**: < 100ms for 1000+ rows
- **Chart rendering**: < 500ms for 1000+ points
- **Memory usage**: No leaks during navigation

## 🚀 Production Checklist

- [ ] No custom caching (use React Query)
- [ ] All presentational components memoized
- [ ] All context values memoized  
- [ ] Large lists virtualized
- [ ] Charts use progressive loading
- [ ] No inline objects/functions in render
- [ ] All API calls use React Query
- [ ] Error boundaries implemented
- [ ] Loading states provided

---
**Save this file! Reference it before every commit.**