import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '../../contexts/AuthContext';
import { useAuth } from '../../contexts/authUtils';
import * as api from '../../services/api';

// Mock the API functions
vi.mock('../../services/api', () => ({
  loginUser: vi.fn(),
  logoutUser: vi.fn(),
  getAuthStatus: vi.fn(),
}));

// Test component to use the auth context
const TestComponent = () => {
  const { user, isAuthenticated, loading, error, login, logout, clearError } = useAuth();

  return (
    <div>
      <div data-testid="auth-status">
        {loading ? 'loading' : isAuthenticated ? 'authenticated' : 'not-authenticated'}
      </div>
      <div data-testid="user-info">{user?.username || 'no-user'}</div>
      <div data-testid="error-info">{error || 'no-error'}</div>
      <button onClick={() => login('admin', 'password123')}>Login</button>
      <button onClick={logout}>Logout</button>
      <button onClick={clearError}>Clear Error</button>
    </div>
  );
};

const renderWithAuth = () => {
  return render(
    <AuthProvider>
      <TestComponent />
    </AuthProvider>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('provides initial unauthenticated state', async () => {
    api.getAuthStatus.mockRejectedValue(new Error('Not authenticated'));

    renderWithAuth();

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('not-authenticated');
    });
    
    expect(screen.getByTestId('user-info')).toHaveTextContent('no-user');
    expect(screen.getByTestId('error-info')).toHaveTextContent('no-error');
  });

  it('loads authenticated state on mount', async () => {
    api.getAuthStatus.mockResolvedValue({
      authenticated: true,
      user: { username: 'admin', role: 'admin' }
    });

    renderWithAuth();

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
    });
    
    expect(screen.getByTestId('user-info')).toHaveTextContent('admin');
  });

  it('handles successful login', async () => {
    api.getAuthStatus.mockRejectedValue(new Error('Not authenticated'));
    api.loginUser.mockResolvedValue({
      user: { username: 'admin', role: 'admin' }
    });

    renderWithAuth();

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('not-authenticated');
    });

    // Perform login
    const user = userEvent.setup();
    await user.click(screen.getByText('Login'));

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
    });
    
    expect(screen.getByTestId('user-info')).toHaveTextContent('admin');
    expect(api.loginUser).toHaveBeenCalledWith('admin', 'password123');
  });

  it('handles login failure', async () => {
    api.getAuthStatus.mockRejectedValue(new Error('Not authenticated'));
    api.loginUser.mockRejectedValue(new Error('Invalid credentials'));

    renderWithAuth();

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('not-authenticated');
    });

    // Attempt login
    const user = userEvent.setup();
    await user.click(screen.getByText('Login'));

    await waitFor(() => {
      expect(screen.getByTestId('error-info')).toHaveTextContent('Invalid credentials');
    });
    
    expect(screen.getByTestId('auth-status')).toHaveTextContent('not-authenticated');
    expect(screen.getByTestId('user-info')).toHaveTextContent('no-user');
  });

  it('handles logout', async () => {
    api.getAuthStatus.mockResolvedValue({
      authenticated: true,
      user: { username: 'admin', role: 'admin' }
    });
    api.logoutUser.mockResolvedValue({});

    renderWithAuth();

    // Wait for initial authenticated state
    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
    });

    // Perform logout
    const user = userEvent.setup();
    await user.click(screen.getByText('Logout'));

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('not-authenticated');
    });
    
    expect(screen.getByTestId('user-info')).toHaveTextContent('no-user');
    expect(api.logoutUser).toHaveBeenCalled();
  });

  it('clears error when clearError is called', async () => {
    api.getAuthStatus.mockRejectedValue(new Error('Not authenticated'));
    api.loginUser.mockRejectedValue(new Error('Login failed'));

    renderWithAuth();

    const user = userEvent.setup();

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('not-authenticated');
    });

    // Trigger error
    await user.click(screen.getByText('Login'));

    await waitFor(() => {
      expect(screen.getByTestId('error-info')).toHaveTextContent('Login failed');
    });

    // Clear error
    await user.click(screen.getByText('Clear Error'));

    expect(screen.getByTestId('error-info')).toHaveTextContent('no-error');
  });

  it('shows loading state during operations', async () => {
    api.getAuthStatus.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({ authenticated: false }), 100))
    );

    renderWithAuth();

    expect(screen.getByTestId('auth-status')).toHaveTextContent('loading');

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('not-authenticated');
    });
  });
});