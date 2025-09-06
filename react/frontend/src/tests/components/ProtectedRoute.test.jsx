import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

/* global global, beforeEach */
import userEvent from '@testing-library/user-event';
import ProtectedRoute from '../../components/ProtectedRoute';
import { AuthProvider } from '../../contexts/AuthContext';
import * as api from '../../services/api';

// Mock the API
vi.mock('../../services/api', () => ({
  getAuthStatus: vi.fn(),
  loginUser: vi.fn(),
}));

// Mock window.prompt for login simulation
const mockPrompt = vi.fn();
global.prompt = mockPrompt;

const TestChild = () => <div data-testid="protected-content">Protected Content</div>;

const renderProtectedRoute = () => {
  return render(
    <AuthProvider>
      <ProtectedRoute>
        <TestChild />
      </ProtectedRoute>
    </AuthProvider>
  );
};

describe('ProtectedRoute Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    api.getAuthStatus.mockImplementation(() => 
      new Promise(resolve => setTimeout(resolve, 100))
    );

    renderProtectedRoute();

    expect(screen.getByText('Checking authentication...')).toBeInTheDocument();
  });

  it('renders protected content when authenticated', async () => {
    api.getAuthStatus.mockResolvedValue({
      authenticated: true,
      user: { username: 'admin', role: 'admin' }
    });

    renderProtectedRoute();

    await waitFor(() => {
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('shows authentication required message when not authenticated', async () => {
    api.getAuthStatus.mockRejectedValue(new Error('Not authenticated'));

    renderProtectedRoute();

    await waitFor(() => {
      expect(screen.getByText('Authentication Required')).toBeInTheDocument();
    });

    expect(screen.getByText('You need to be logged in to access this page.')).toBeInTheDocument();
    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('provides login functionality when not authenticated', async () => {
    api.getAuthStatus.mockRejectedValue(new Error('Not authenticated'));
    api.loginUser.mockResolvedValue({
      user: { username: 'testuser', role: 'user' }
    });
    
    mockPrompt
      .mockReturnValueOnce('testuser')  // username prompt
      .mockReturnValueOnce('password'); // password prompt

    renderProtectedRoute();

    await waitFor(() => {
      expect(screen.getByText('Authentication Required')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByText('Login'));

    expect(mockPrompt).toHaveBeenCalledTimes(2);
    expect(mockPrompt).toHaveBeenNthCalledWith(1, 'Username:');
    expect(mockPrompt).toHaveBeenNthCalledWith(2, 'Password:');
    expect(api.loginUser).toHaveBeenCalledWith('testuser', 'password');
  });

  it('handles login with empty credentials', async () => {
    api.getAuthStatus.mockRejectedValue(new Error('Not authenticated'));
    
    mockPrompt
      .mockReturnValueOnce('')  // empty username
      .mockReturnValueOnce(''); // empty password

    renderProtectedRoute();

    await waitFor(() => {
      expect(screen.getByText('Authentication Required')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByText('Login'));

    expect(api.loginUser).not.toHaveBeenCalled();
  });

  it('handles cancelled login prompts', async () => {
    api.getAuthStatus.mockRejectedValue(new Error('Not authenticated'));
    
    mockPrompt.mockReturnValue(null); // user cancelled

    renderProtectedRoute();

    await waitFor(() => {
      expect(screen.getByText('Authentication Required')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByText('Login'));

    expect(api.loginUser).not.toHaveBeenCalled();
  });

  it('renders protected content after successful login', async () => {
    api.getAuthStatus.mockRejectedValue(new Error('Not authenticated'));
    api.loginUser.mockResolvedValue({
      user: { username: 'testuser', role: 'user' }
    });
    
    mockPrompt
      .mockReturnValueOnce('testuser')
      .mockReturnValueOnce('password');

    renderProtectedRoute();

    await waitFor(() => {
      expect(screen.getByText('Authentication Required')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByText('Login'));

    // After successful login, the auth context should update and show protected content
    await waitFor(() => {
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });
  });
});