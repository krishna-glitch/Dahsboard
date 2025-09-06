import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WaterQuality from '../../pages/WaterQuality';
import { AuthProvider } from '../../contexts/AuthContext';
import * as api from '../../services/api';

// Mock the API
vi.mock('../../services/api', () => ({
  getAuthStatus: vi.fn(),
  getWaterQualityData: vi.fn(),
}));

const mockWaterQualityData = {
  water_quality_data: [
    {
      measurement_timestamp: '2024-01-01T10:00:00Z',
      site_id: 'S1',
      ph: 7.2,
      temperature_c: 22.5,
      conductivity_us_cm: 450,
      dissolved_oxygen_mg_l: 8.1
    },
    {
      measurement_timestamp: '2024-01-01T11:00:00Z',
      site_id: 'S2',
      ph: 7.8,
      temperature_c: 23.1,
      conductivity_us_cm: 380,
      dissolved_oxygen_mg_l: 7.9
    }
  ],
  metadata: {
    record_count: 2,
    sites: ['S1', 'S2'],
    time_range: 'Last 30 Days',
    date_range: {
      start: '2024-01-01',
      end: '2024-01-31'
    },
    last_updated: '2024-01-31T12:00:00Z'
  }
};

const renderWaterQuality = () => {
  // Mock authenticated state
  api.getAuthStatus.mockResolvedValue({
    authenticated: true,
    user: { username: 'admin', role: 'admin' }
  });

  return render(
    <AuthProvider>
      <WaterQuality />
    </AuthProvider>
  );
};

describe('WaterQuality Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getWaterQualityData.mockResolvedValue(mockWaterQualityData);
  });

  it('renders the page title', async () => {
    renderWaterQuality();

    await waitFor(() => {
      expect(screen.getByText('Water Quality Analysis')).toBeInTheDocument();
    });
  });

  it('renders site selection controls', async () => {
    renderWaterQuality();

    await waitFor(() => {
      expect(screen.getByText('Select Sites')).toBeInTheDocument();
    });
  });

  it('renders time range selection', async () => {
    renderWaterQuality();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Last 30 Days')).toBeInTheDocument();
    });
  });

  it('shows custom date inputs when custom range is selected', async () => {
    renderWaterQuality();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Last 30 Days')).toBeInTheDocument();
    });

    const timeRangeSelect = screen.getByDisplayValue('Last 30 Days');
    await user.selectOptions(timeRangeSelect, 'custom');

    expect(screen.getByText('Start Date')).toBeInTheDocument();
    expect(screen.getByText('End Date')).toBeInTheDocument();
  });

  it('loads and displays water quality data', async () => {
    renderWaterQuality();

    await waitFor(() => {
      expect(api.getWaterQualityData).toHaveBeenCalled();
    });

    // Check if metric cards are displayed
    await waitFor(() => {
      expect(screen.getByText('Total Records')).toBeInTheDocument();
      expect(screen.getByText('Unique Sites')).toBeInTheDocument();
      expect(screen.getByText('Average pH')).toBeInTheDocument();
    });
  });

  it('displays data coverage information', async () => {
    renderWaterQuality();

    await waitFor(() => {
      expect(screen.getByText('Data Coverage')).toBeInTheDocument();
    });
  });

  it('shows sample data table', async () => {
    renderWaterQuality();

    await waitFor(() => {
      expect(screen.getByText('Timestamp')).toBeInTheDocument();
      expect(screen.getByText('Site')).toBeInTheDocument();
    });
  });

  it('renders tabs for different views', async () => {
    renderWaterQuality();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /overview/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /visualization/i })).toBeInTheDocument();
    });
  });

  it('switches between tabs', async () => {
    renderWaterQuality();
    const user = userEvent.setup();

    // Click on visualization tab
    await waitFor(() => {
      const vizTab = screen.getByRole('tab', { name: /visualization/i });
      expect(vizTab).toBeInTheDocument();
    });

    const vizTab = screen.getByRole('tab', { name: /visualization/i });
    await user.click(vizTab);

    // Should show chart mock from setupTests
    await waitFor(() => {
      expect(screen.getAllByText('Plotly Chart Mock')).toHaveLength(2);
    });
  });

  it('handles API error gracefully', async () => {
    api.getWaterQualityData.mockRejectedValue(new Error('Network error'));

    renderWaterQuality();

    // The component should show error state
    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });

    expect(api.getWaterQualityData).toHaveBeenCalled();
  });

  it('calls API when filters are applied', async () => {
    renderWaterQuality();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Last 30 Days')).toBeInTheDocument();
    });

    // Change time range
    const timeRangeSelect = screen.getByDisplayValue('Last 30 Days');
    await user.selectOptions(timeRangeSelect, 'Last 7 Days');

    // Should trigger new API call
    await waitFor(() => {
      expect(api.getWaterQualityData).toHaveBeenCalledTimes(2);
    });
  });

  it('calculates average pH correctly', async () => {
    renderWaterQuality();

    await waitFor(() => {
      // Average of 7.2 and 7.8 should be 7.50
      expect(screen.getByText('7.50')).toBeInTheDocument();
    });
  });
});