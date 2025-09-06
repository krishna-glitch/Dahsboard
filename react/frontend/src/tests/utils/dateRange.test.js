import { describe, it, expect } from 'vitest';
import { computePresetWindow } from '../../utils/dateRange';

describe('computePresetWindow', () => {
  it('computes inclusive last 7 days window', () => {
    const { startIso, endIso } = computePresetWindow('2025-08-01', '2025-08-31', 'Last 7 Days');
    expect(startIso.startsWith('2025-08-25')).toBe(true); // 31 - 6 days
    expect(endIso.startsWith('2025-08-31')).toBe(true);
  });

  it('falls back to full range for unknown preset', () => {
    const { startIso, endIso } = computePresetWindow('2025-01-10', '2025-01-20', 'Unknown');
    expect(startIso.startsWith('2025-01-10')).toBe(true);
    expect(endIso.startsWith('2025-01-20')).toBe(true);
  });
});

