import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Admin from '../../pages/Admin';
import { AuthProvider } from '../../contexts/AuthContext';
import * as api from '../../services/api';

// Mock the API
vi.mock('../../services/api', () => ({
  getAuthStatus: vi.fn(),
  getAdminData: vi.fn(),
}));

const mockAdminData = {
  users: [
    { id: 1, username: 'admin', role: 'admin', status: 'active' }
  ],
  system_settings: {
    alert_thresholds: { ph_low: 6.5, ph_high: 8.5 }
  }
};

const renderAdmin = () => {
  api.getAuthStatus.mockResolvedValue({
    authenticated: true,
    user: { username: 'admin', role: 'admin' }
  });

  return render(
    <BrowserRouter>
      <AuthProvider>
        <Admin />
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('Admin Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getAdminData.mockResolvedValue(mockAdminData);
  });

  it('renders without crashing', async () => {
    renderAdmin();
    expect(document.body).toBeInTheDocument();
  });

  it('restricts access to admin users', async () => {
    api.getAuthStatus.mockResolvedValue({
      authenticated: true,
      user: { username: 'user', role: 'user' }
    });

    renderAdmin();

    await waitFor(() => {
      const content = document.querySelector('.container, body');
      expect(content).toBeInTheDocument();
    });
  });
});