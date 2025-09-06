import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import RedoxAnalysis from '../../pages/RedoxAnalysis';
import { AuthProvider } from '../../contexts/AuthContext';
import * as api from '../../services/api';

// Mock the API
vi.mock('../../services/api', () => ({
  getAuthStatus: vi.fn(),
  getRedoxAnalysisData: vi.fn(),
}));

const mockRedoxData = {
  redox_data: [
    {
      measurement_timestamp: '2024-01-01T10:00:00Z',
      site_code: 'S1',
      redox_value_mv: 250.5,
      depth_cm: 15.2
    }
  ],
  metadata: {
    sites: ['S1', 'S2'],
    total_records: 100,
    average_redox: 245.3
  }
};

const renderRedoxAnalysis = () => {
  api.getAuthStatus.mockResolvedValue({
    authenticated: true,
    user: { username: 'admin', role: 'admin' }
  });

  return render(
    <BrowserRouter>
      <AuthProvider>
        <RedoxAnalysis />
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('RedoxAnalysis Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getRedoxAnalysisData.mockResolvedValue(mockRedoxData);
  });

  it('renders the page title', async () => {
    renderRedoxAnalysis();

    await waitFor(() => {
      expect(screen.getByText(/Redox Analysis/i)).toBeInTheDocument();
    });
  });

  it('loads redox analysis data', async () => {
    renderRedoxAnalysis();

    await waitFor(() => {
      expect(api.getRedoxAnalysisData).toHaveBeenCalled();
    });
  });

  it('renders redox visualization charts', async () => {
    renderRedoxAnalysis();

    await waitFor(() => {
      expect(screen.getByText('Plotly Chart Mock')).toBeInTheDocument();
    });
  });

  it('handles API error gracefully', async () => {
    api.getRedoxAnalysisData.mockRejectedValue(new Error('Network error'));

    renderRedoxAnalysis();

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });
  });
});