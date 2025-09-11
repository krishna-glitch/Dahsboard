/**
 * Code Quality Analysis Service
 * Provides mock data for code quality monitoring and analysis
 * In production, this would integrate with real analysis tools
 */

// Simulate realistic code quality metrics based on actual project characteristics
const generateCodeQualityData = () => {
  return {
    overall_score: Math.floor(Math.random() * 20) + 75, // 75-95
    grade: 'B+',
    tech_debt_ratio: Math.floor(Math.random() * 8) + 3, // 3-10%
    lines_of_code: 45780,
    avg_complexity: Math.floor(Math.random() * 3) + 6, // 6-8
    code_coverage: Math.floor(Math.random() * 15) + 75, // 75-90%
    maintainability_index: Math.floor(Math.random() * 25) + 65, // 65-90
    duplication_percent: Math.floor(Math.random() * 7) + 2, // 2-8%
    performance_issues: Math.floor(Math.random() * 8) + 2, // 2-9
    trend: Math.random() > 0.6 ? 'improving' : Math.random() > 0.3 ? 'stable' : 'declining'
  };
};

const generateLintResults = () => {
  const errors = Math.floor(Math.random() * 5) + 1; // 1-5 errors
  const warnings = Math.floor(Math.random() * 15) + 5; // 5-19 warnings
  const files = 127;
  
  const topIssues = [
    { rule: 'no-unused-vars', count: Math.floor(Math.random() * 8) + 2 },
    { rule: 'prefer-const', count: Math.floor(Math.random() * 6) + 1 },
    { rule: 'no-console', count: Math.floor(Math.random() * 4) + 1 },
    { rule: 'react-hooks/exhaustive-deps', count: Math.floor(Math.random() * 5) + 1 },
    { rule: 'jsx-a11y/alt-text', count: Math.floor(Math.random() * 3) + 1 }
  ].sort((a, b) => b.count - a.count);

  const quality_score = Math.max(0, 100 - (errors * 10) - (warnings * 2));

  return {
    errors,
    warnings,
    files_checked: files,
    quality_score,
    top_issues: topIssues.slice(0, 3)
  };
};

const generateSecurityScan = () => {
  const high = Math.floor(Math.random() * 3); // 0-2 high severity
  const medium = Math.floor(Math.random() * 5) + 1; // 1-5 medium
  const low = Math.floor(Math.random() * 10) + 3; // 3-12 low
  
  const risk_score = Math.min(100, (high * 30) + (medium * 10) + (low * 2));
  const vulnerable_dependencies = Math.floor(Math.random() * 6); // 0-5
  
  return {
    high_severity: high,
    medium_severity: medium,
    low_severity: low,
    risk_score,
    vulnerable_dependencies,
    scan_date: new Date().toLocaleDateString()
  };
};

const generateBundleAnalysis = () => {
  const mainSize = (Math.random() * 3 + 1.5).toFixed(1); // 1.5-4.5 MB
  const chunksCount = Math.floor(Math.random() * 8) + 12; // 12-19 chunks
  const unusedCode = Math.floor(Math.random() * 20) + 5; // 5-24%
  
  const dependencies = [
    { name: 'plotly.js', size: Math.floor(Math.random() * 200) + 800 },
    { name: 'react-bootstrap', size: Math.floor(Math.random() * 100) + 150 },
    { name: '@tanstack/react-query', size: Math.floor(Math.random() * 80) + 120 },
    { name: 'react-router-dom', size: Math.floor(Math.random() * 60) + 80 },
    { name: 'axios', size: Math.floor(Math.random() * 40) + 60 }
  ].sort((a, b) => b.size - a.size);
  
  return {
    main_bundle_size_mb: parseFloat(mainSize),
    chunks_count: chunksCount,
    unused_code_percent: unusedCode,
    largest_dependencies: dependencies
  };
};

// Mock API endpoints
export const getCodeQualityOverview = async () => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
  
  return generateCodeQualityData();
};

export const getLintResults = async () => {
  await new Promise(resolve => setTimeout(resolve, Math.random() * 800 + 300));
  
  return generateLintResults();
};

export const getSecurityScan = async () => {
  await new Promise(resolve => setTimeout(resolve, Math.random() * 1200 + 400));
  
  return generateSecurityScan();
};

export const getBundleAnalysis = async () => {
  await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 600));
  
  return generateBundleAnalysis();
};

// Utility function to run actual ESLint analysis (when available)
export const runLiveCodeAnalysis = async () => {
  try {
    // This would integrate with actual linting tools
    const response = await fetch('/api/v1/code-quality/run-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        includeTests: true,
        includeNodeModules: false,
        severity: 'all'
      })
    });
    
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.warn('Live code analysis not available, using mock data');
  }
  
  // Fallback to mock data
  return getLintResults();
};

// Performance anti-pattern detector
export const detectPerformanceIssues = () => {
  const commonIssues = [
    {
      type: 'Inline Style Objects',
      severity: 'medium',
      count: Math.floor(Math.random() * 5) + 1,
      impact: 'Causes unnecessary re-renders',
      solution: 'Extract to constants outside component'
    },
    {
      type: 'Missing React.memo',
      severity: 'low', 
      count: Math.floor(Math.random() * 8) + 2,
      impact: 'Unnecessary component re-renders',
      solution: 'Wrap pure components with React.memo'
    },
    {
      type: 'Inline Functions in JSX',
      severity: 'high',
      count: Math.floor(Math.random() * 3) + 1,
      impact: 'Child component re-renders on every render',
      solution: 'Use useCallback for event handlers'
    },
    {
      type: 'Direct API Calls in useEffect',
      severity: 'medium',
      count: Math.floor(Math.random() * 4) + 1,
      impact: 'Suboptimal caching and loading states', 
      solution: 'Use React Query or similar data fetching library'
    }
  ];
  
  return commonIssues.filter(() => Math.random() > 0.3); // Randomly include issues
};

export default {
  getCodeQualityOverview,
  getLintResults,
  getSecurityScan,
  getBundleAnalysis,
  runLiveCodeAnalysis,
  detectPerformanceIssues
};