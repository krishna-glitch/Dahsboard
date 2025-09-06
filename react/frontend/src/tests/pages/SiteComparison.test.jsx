import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import SiteComparison from '../../pages/SiteComparison';
import { AuthProvider } from '../../contexts/AuthContext';
import * as api from '../../services/api';

// Mock the API
vi.mock('../../services/api', () => ({
  getAuthStatus: vi.fn(),
  getSiteComparisonData: vi.fn(),
}));

const mockSiteComparisonData = {
  water_quality_data: [
    {
      measurement_timestamp: '2024-01-01T10:00:00Z',
      site_code: 'S1',
      ph: 7.2,
      temperature_c: 22.5
    }
  ],
  redox_data: [
    {
      measurement_timestamp: '2024-01-01T10:00:00Z',
      site_code: 'S1',
      redox_value_mv: 250.5
    }
  ],
  metadata: {
    sites: ['S1', 'S2'],
    water_quality_columns: ['ph', 'temperature_c'],
    redox_columns: ['redox_value_mv']
  }
};

const renderSiteComparison = () => {
  api.getAuthStatus.mockResolvedValue({
    authenticated: true,
    user: { username: 'admin', role: 'admin' }
  });

  return render(
    <BrowserRouter>
      <AuthProvider>
        <SiteComparison />
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('SiteComparison Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getSiteComparisonData.mockResolvedValue(mockSiteComparisonData);
  });

  it('renders the page title', async () => {
    renderSiteComparison();

    await waitFor(() => {
      expect(screen.getByText(/Site Comparison|Comparative Analysis/i)).toBeInTheDocument();
    });
  });

  it('loads site comparison data', async () => {
    renderSiteComparison();

    await waitFor(() => {
      expect(api.getSiteComparisonData).toHaveBeenCalled();
    });
  });

  it('renders comparison charts', async () => {
    renderSiteComparison();

    await waitFor(() => {
      expect(screen.getByText('Plotly Chart Mock')).toBeInTheDocument();
    });
  });

  it('handles API error gracefully', async () => {
    api.getSiteComparisonData.mockRejectedValue(new Error('Network error'));

    renderSiteComparison();

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });
  });
});