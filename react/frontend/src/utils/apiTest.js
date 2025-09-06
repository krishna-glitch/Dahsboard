// Simple API connection test
export const testApiConnection = async () => {
  const apiUrl = 'http://127.0.0.1:5000';
  
  console.log('🔍 Testing API connection...');
  
  try {
    // Test basic API status
    const statusResponse = await fetch(`${apiUrl}/`);
    const statusData = await statusResponse.json();
    console.log('✅ API Status:', statusData);
    
    // Test CORS preflight
    const corsResponse = await fetch(`${apiUrl}/api/v1/home/data`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });
    console.log('🔄 CORS Response Status:', corsResponse.status);
    console.log('🔄 CORS Headers:', Object.fromEntries(corsResponse.headers.entries()));
    
    // Test actual data request
    const dataResponse = await fetch(`${apiUrl}/api/v1/home/data`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:5173'
      }
    });
    
    console.log('📊 Data Response Status:', dataResponse.status);
    
    if (dataResponse.ok) {
      const data = await dataResponse.json();
      console.log('✅ Data received:', data);
      return { success: true, data };
    } else {
      const errorData = await dataResponse.json();
      console.log('❌ Data Error:', errorData);
      return { success: false, error: errorData };
    }
    
  } catch (error) {
    console.log('💥 Connection Error:', error);
    return { success: false, error: error.message };
  }
};