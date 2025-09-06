import { describe, it, expect } from 'vitest';
import { computeMetricsInline } from '../../hooks/useRedoxMetrics';

describe('computeMetricsInline', () => {
  it('handles empty data', () => {
    const m = computeMetricsInline([]);
    expect(m.totalMeasurements).toBe(0);
    expect(m.redoxRange).toBe('No Data');
  });

  it('computes metrics for small dataset', () => {
    const data = [
      { processed_eh: 100, measurement_timestamp: '2025-01-01T00:00:00Z' },
      { processed_eh: -50, measurement_timestamp: '2025-01-01T01:00:00Z' },
      { processed_eh: 200, measurement_timestamp: '2025-01-01T02:00:00Z' }
    ];
    const m = computeMetricsInline(data);
    expect(m.totalMeasurements).toBe(3);
    expect(m.validMeasurements).toBe(3);
    expect(m.avgRedox).toBeCloseTo(83.33, 1);
    expect(m.redoxRange).toContain('to');
  });
});

