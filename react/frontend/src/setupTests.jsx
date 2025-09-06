import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock URL.createObjectURL
globalThis.URL.createObjectURL = vi.fn();

// Mock plotly.js completely  
vi.mock('plotly.js', () => ({
  default: {}
}));

// Mock react-plotly.js
vi.mock('react-plotly.js', async () => {
  const React = await import('react'); // Use dynamic import for React
  return {
    default: ({ data, ...props }) => { // Removed layout
      return React.createElement('div', {
        'data-testid': 'plotly-chart',
        'data-plot-data': JSON.stringify(data || []),
        ...props
      }, 'Plotly Chart Mock');
    }
  };
});