import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/authUtils';
import { useNavigate, useLocation } from 'react-router-dom';
import './Login.css';

const Login = () => {
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const from = location.state?.from?.pathname || '/';

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(credentials.username, credentials.password);
      
      if (result.success) {
        navigate(from, { replace: true });
      } else {
        setError(result.error || 'Login failed');
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setCredentials(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <div className="login-container">
      <div className="auth-wrapper">
        <div className="auth-visual">
          <div className="brand">
            <div className="brand-logo" aria-hidden="true">
              <i className="bi bi-droplet-half"></i>
            </div>
            <div className="brand-text">
              <h2>Water Quality</h2>
              <p>Insights that flow</p>
            </div>
          </div>
          {/* Decorative, lightweight animation (CSS only) */}
          <div className="animated-water" aria-hidden="true">
            <span className="bubble b1"></span>
            <span className="bubble b2"></span>
            <span className="bubble b3"></span>
            <span className="bubble b4"></span>
            <div className="wave w1"></div>
            <div className="wave w2"></div>
          </div>
          <ul className="features">
            <li><i className="bi bi-graph-up"></i> Real‑time analytics</li>
            <li><i className="bi bi-shield-check"></i> Secure access</li>
            <li><i className="bi bi-lightning-charge"></i> Blazing fast</li>
          </ul>
        </div>

        <div className="auth-card">
          <div className="login-header modern">
            <h1>Welcome back</h1>
            <p>Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            {error && (
              <div className="error-message">
                <i className="bi bi-exclamation-triangle"></i>
                {error}
              </div>
            )}

            <div className="form-group with-icon">
              <label htmlFor="username">Username</label>
              <div className="input-wrap">
                <i className="bi bi-person"></i>
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={credentials.username}
                  onChange={handleChange}
                  placeholder="e.g. admin"
                  required
                  disabled={loading}
                  autoFocus
                />
              </div>
            </div>

            <div className="form-group with-icon">
              <label htmlFor="password">Password</label>
              <div className="input-wrap">
                <i className="bi bi-lock"></i>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={credentials.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="icon-button"
                  onClick={() => setShowPassword(v => !v)}
                  tabIndex={-1}
                >
                  <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                </button>
              </div>
            </div>

            <div className="form-row">
              <label className="checkbox">
                <input type="checkbox" disabled={loading} />
                <span>Remember me</span>
              </label>
              <a className="link-muted" href="#" onClick={(e) => { e.preventDefault(); navigate('/support'); }}>Forgot password?</a>
            </div>

            <button
              type="submit"
              className="login-button large"
              disabled={loading || !credentials.username || !credentials.password}
            >
              {loading ? (
                <>
                  <i className="bi bi-arrow-repeat spin"></i>
                  Signing in...
                </>
              ) : (
                <>
                  <i className="bi bi-box-arrow-in-right"></i>
                  Sign In
                </>
              )}
            </button>
          </form>

          <div className="login-footer subtle">
            <details>
              <summary>Need demo credentials?</summary>
              <div className="test-credentials">
                <p><strong>Admin:</strong> admin / admin123</p>
                <p><strong>User:</strong> test_user / test123</p>
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
