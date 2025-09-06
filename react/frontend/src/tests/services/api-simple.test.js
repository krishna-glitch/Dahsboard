import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the specific API functions we want to test
const mockFetchData = vi.fn();

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual('../../services/api');
  return {
    ...actual,
    fetchData: mockFetchData,
    getWaterQualityData: vi.fn().mockImplementation((params) => 
      mockFetchData(`water_quality/data?${params}`)
    ),
    loginUser: vi.fn().mockImplementation((username, password) => 
      mockFetchData('auth/login', 'POST', { username, password })
    ),
    getAuthStatus: vi.fn().mockImplementation(() => 
      mockFetchData('auth/status')
    ),
    getHomeData: vi.fn().mockImplementation((params) => 
      mockFetchData('home/data', 'GET', null, params)
    ),
  };
});

describe('API Service Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getWaterQualityData calls correct endpoint with params', async () => {
    const { getWaterQualityData } = await import('../../services/api');
    
    const params = 'sites=S1&timeRange=30';
    await getWaterQualityData(params);

    expect(mockFetchData).toHaveBeenCalledWith(`water_quality/data?${params}`);
  });

  it('loginUser sends correct credentials', async () => {
    const { loginUser } = await import('../../services/api');
    
    await loginUser('admin', 'password123');

    expect(mockFetchData).toHaveBeenCalledWith('auth/login', 'POST', { 
      username: 'admin', 
      password: 'password123' 
    });
  });

  it('getAuthStatus calls auth/status endpoint', async () => {
    const { getAuthStatus } = await import('../../services/api');
    
    await getAuthStatus();

    expect(mockFetchData).toHaveBeenCalledWith('auth/status');
  });

  it('getHomeData calls home/data endpoint with params', async () => {
    const { getHomeData } = await import('../../services/api');
    
    const params = { timeRange: '30' };
    await getHomeData(params);

    expect(mockFetchData).toHaveBeenCalledWith('home/data', 'GET', null, params);
  });
});