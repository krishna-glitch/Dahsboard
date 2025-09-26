import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import Home from '../../pages/Home';
import { AuthProvider } from '../../contexts/AuthContext';
import * as api from '../../services/api';

// Mock the API
vi.mock('../../services/api', () => ({
  getAuthStatus: vi.fn(),
  getHomeData: vi.fn(),
}));

const mockHomeData = {
  dashboard_data: {
    dashboard_stats: {
      status: 'success',
      message: null,
      data: {
        active_sites: 3,
        total_sites: 4,
        data_quality: 95,
        active_alerts: 0,
        recent_measurements: 1500,
        recent_measurements_window: {
          start: '2024-01-30T12:00:00Z',
          end: '2024-01-31T12:00:00Z',
          is_current: true,
          status: 'success'
        },
        data_current_through: '2024-01-31T12:00:00Z',
        latest_measurement_timestamp: '2024-01-31T12:00:00Z'
      }
    },
    latest_per_site: {
      status: 'success',
      message: null,
      data: [
        { site_code: 'S1', last_water_quality: '2024-01-31T11:00:00Z', last_redox: '2024-01-31T10:30:00Z' },
        { site_code: 'S2', last_water_quality: '2024-01-30T16:00:00Z', last_redox: null }
      ]
    },
    system_health_data: {
      status: 'success',
      data: {
        timestamps: ['2024-01-31T10:00:00Z', '2024-01-31T11:00:00Z'],
        values: [99.1, 99.3]
      }
    },
    recent_activity: {
      status: 'success',
      data: [
        { measurement_timestamp: '2024-01-31T10:00:00Z', site_code: 'S1' }
      ]
    }
  },
  metadata: { last_updated: '2024-01-31T12:00:00Z' }
};

const renderHome = () => {
  // Mock authenticated state
  api.getAuthStatus.mockResolvedValue({
    authenticated: true,
    user: { username: 'admin', role: 'admin' }
  });

  return render(
    <BrowserRouter>
      <AuthProvider>
        <Home />
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('Home Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getHomeData.mockResolvedValue(mockHomeData);
  });

  it('renders the dashboard title', async () => {
    renderHome();

    await waitFor(() => {
      expect(screen.getByText('Dashboard Overview')).toBeInTheDocument();
    });
  });

  it('displays dashboard statistics', async () => {
    renderHome();

    await waitFor(() => {
      expect(api.getHomeData).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText('Active Sites')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('Data Quality')).toBeInTheDocument();
      expect(screen.getByText('95%')).toBeInTheDocument();
    });
  });

  it('shows quick action buttons', async () => {
    renderHome();

    await waitFor(() => {
      expect(screen.getByText('Water Quality')).toBeInTheDocument();
      expect(screen.getByText('Upload Data')).toBeInTheDocument();
      expect(screen.getByText('Reports')).toBeInTheDocument();
    });
  });

  it('displays recent activity section', async () => {
    renderHome();

    await waitFor(() => {
      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    });
  });

  it('shows system health chart', async () => {
    renderHome();

    await waitFor(() => {
      expect(screen.getByText('System Health Trend')).toBeInTheDocument();
      expect(screen.getByText('Plotly Chart Mock')).toBeInTheDocument();
    });
  });

  it('displays performance tips section', async () => {
    renderHome();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText('Performance Tips')).toBeInTheDocument();
    });

    const showTipsButton = screen.getByText('Show Tips');
    await user.click(showTipsButton);

    expect(screen.getByText('Hide Tips')).toBeInTheDocument();
  });

  it('handles API error gracefully', async () => {
    api.getHomeData.mockRejectedValue(new Error('Network error'));

    renderHome();

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });
  });

  it('shows welcome message for new users', async () => {
    renderHome();

    await waitFor(() => {
      expect(screen.getByText(/Welcome to your environmental monitoring dashboard/)).toBeInTheDocument();
      expect(screen.getByText(/Learn about Environmental Monitoring/)).toBeInTheDocument();
    });
  });
});