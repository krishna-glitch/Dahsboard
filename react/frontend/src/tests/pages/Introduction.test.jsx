import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Introduction from '../../pages/Introduction';
import { AuthProvider } from '../../contexts/AuthContext';
import * as api from '../../services/api';

// Mock the API
vi.mock('../../services/api', () => ({
  getAuthStatus: vi.fn(),
}));

const renderIntroduction = () => {
  api.getAuthStatus.mockResolvedValue({
    authenticated: true,
    user: { username: 'admin', role: 'admin' }
  });

  return render(
    <BrowserRouter>
      <AuthProvider>
        <Introduction />
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('Introduction Page', () => {
  it('renders without crashing', async () => {
    renderIntroduction();
    
    // Just check that the page renders
    expect(document.body).toBeInTheDocument();
  });

  it('displays introduction content', async () => {
    renderIntroduction();

    await waitFor(() => {
      const headings = screen.queryAllByRole('heading');
      expect(headings.length).toBeGreaterThan(0);
    });
  });
});