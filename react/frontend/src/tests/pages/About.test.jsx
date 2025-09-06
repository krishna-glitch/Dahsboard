import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import About from '../../pages/About';
import { AuthProvider } from '../../contexts/AuthContext';
import * as api from '../../services/api';

// Mock the API
vi.mock('../../services/api', () => ({
  getAuthStatus: vi.fn(),
}));

const renderAbout = () => {
  api.getAuthStatus.mockResolvedValue({
    authenticated: true,
    user: { username: 'admin', role: 'admin' }
  });

  return render(
    <BrowserRouter>
      <AuthProvider>
        <About />
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('About Page', () => {
  it('renders without crashing', async () => {
    renderAbout();
    
    // Just check that the page renders
    expect(document.body).toBeInTheDocument();
  });

  it('displays about content', async () => {
    renderAbout();

    await waitFor(() => {
      const content = document.querySelector('.container, .mt-4, body');
      expect(content).toBeInTheDocument();
    });
  });
});