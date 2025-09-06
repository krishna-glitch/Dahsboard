import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MetricCard from '../../components/MetricCard';

describe('MetricCard Component', () => {
  it('renders title and value correctly', () => {
    const title = 'Test Metric';
    const value = '123.45';
    
    render(<MetricCard title={title} value={value} />);
    
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText(value)).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const customClass = 'custom-metric-card';
    
    render(<MetricCard title="Test" value="100" className={customClass} />);
    
    const card = screen.getByText('Test').closest('.card');
    expect(card).toHaveClass(customClass);
  });

  it('renders with default className when none provided', () => {
    render(<MetricCard title="Test" value="100" />);
    
    const card = screen.getByText('Test').closest('.card');
    expect(card).toHaveClass('card');
  });

  it('handles numeric values', () => {
    render(<MetricCard title="Count" value={42} />);
    
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('handles string values with special characters', () => {
    render(<MetricCard title="Status" value="95.5%" />);
    
    expect(screen.getByText('95.5%')).toBeInTheDocument();
  });
});