import React, { useEffect } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { useAuth } from '../contexts/authUtils';
import { useNavigate, useLocation } from 'react-router-dom';
import { LoginFormData } from '../types/forms';
import { createLoginValidation } from '../utils/formValidation';
import './Login.css';

interface LoginFormProps {}

interface LocationState {
  from?: {
    pathname: string;
  };
}

// Get validation rules from utility
const loginValidationRules = createLoginValidation();

const Login: React.FC<LoginFormProps> = () => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
    setError,
    watch
  } = useForm<LoginFormData>({
    mode: 'onChange',
    defaultValues: {
      username: '',
      password: ''
    }
  });

  const [showPassword, setShowPassword] = React.useState<boolean>(false);

  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: LocationState };

  const from = location.state?.from?.pathname || '/';

  // Watch form values for UI state
  const watchedValues = watch();

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  const onSubmit: SubmitHandler<LoginFormData> = async (data) => {
    try {
      const result = await login(data.username, data.password);

      if (result.success) {
        navigate(from, { replace: true });
      } else {
        // Set server-side errors using React Hook Form's setError
        setError('root.serverError', {
          type: 'server',
          message: result.error || 'Login failed'
        });
      }
    } catch (err) {
      setError('root.serverError', {
        type: 'server',
        message: err instanceof Error ? err.message : 'An unexpected error occurred'
      });
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(prev => !prev);
  };

  return (
    <div className="login-container">
      <div className="auth-wrapper">
        <div className="auth-visual">
          <div className="brand">
            <div className="brand-logo" aria-hidden="true">
              <div className="logo-icon">
                <i className="bi bi-droplet-fill"></i>
              </div>
            </div>
            <h1 className="brand-title">Environmental Monitoring</h1>
            <p className="brand-subtitle">Water Quality Analytics Platform</p>
          </div>

          <div className="visual-elements" aria-hidden="true">
            <div className="floating-element element-1">
              <i className="bi bi-graph-up"></i>
            </div>
            <div className="floating-element element-2">
              <i className="bi bi-water"></i>
            </div>
            <div className="floating-element element-3">
              <i className="bi bi-shield-check"></i>
            </div>
          </div>
        </div>

        <div className="auth-form-container">
          <div className="auth-form">
            <div className="auth-header">
              <h2>Welcome Back</h2>
              <p>Sign in to access your monitoring dashboard</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="login-form" noValidate>
              {/* Server Error Display */}
              {errors.root?.serverError && (
                <div className="error-banner" role="alert">
                  <i className="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
                  <span>{errors.root.serverError.message}</span>
                </div>
              )}

              {/* Username Field */}
              <div className="form-group">
                <label htmlFor="username" className="form-label">
                  Username
                  <span className="required-indicator" aria-label="required">*</span>
                </label>
                <div className="input-wrapper">
                  <div className="input-icon">
                    <i className="bi bi-person" aria-hidden="true"></i>
                  </div>
                  <input
                    {...register('username', loginValidationRules.username)}
                    type="text"
                    id="username"
                    className={`form-input ${errors.username ? 'error' : ''}`}
                    placeholder="Enter your username"
                    autoComplete="username"
                    aria-invalid={errors.username ? 'true' : 'false'}
                    aria-describedby={errors.username ? 'username-error' : undefined}
                  />
                </div>
                {errors.username && (
                  <div id="username-error" className="error-message" role="alert">
                    <i className="bi bi-exclamation-circle" aria-hidden="true"></i>
                    {errors.username.message}
                  </div>
                )}
              </div>

              {/* Password Field */}
              <div className="form-group">
                <label htmlFor="password" className="form-label">
                  Password
                  <span className="required-indicator" aria-label="required">*</span>
                </label>
                <div className="input-wrapper">
                  <div className="input-icon">
                    <i className="bi bi-lock" aria-hidden="true"></i>
                  </div>
                  <input
                    {...register('password', loginValidationRules.password)}
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    className={`form-input ${errors.password ? 'error' : ''}`}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    aria-invalid={errors.password ? 'true' : 'false'}
                    aria-describedby={errors.password ? 'password-error' : undefined}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={togglePasswordVisibility}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`} aria-hidden="true"></i>
                  </button>
                </div>
                {errors.password && (
                  <div id="password-error" className="error-message" role="alert">
                    <i className="bi bi-exclamation-circle" aria-hidden="true"></i>
                    {errors.password.message}
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className={`login-button ${isSubmitting ? 'loading' : ''}`}
                disabled={isSubmitting || !isValid}
                aria-describedby="login-button-status"
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner" aria-hidden="true"></span>
                    <span>Signing In...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <i className="bi bi-arrow-right" aria-hidden="true"></i>
                  </>
                )}
              </button>

              {/* Form Status */}
              <div id="login-button-status" className="sr-only" aria-live="polite">
                {isSubmitting ? 'Signing in, please wait...' :
                 !isValid ? 'Please fill in all required fields correctly' :
                 'Ready to sign in'}
              </div>
            </form>

            {/* Footer */}
            <div className="auth-footer">
              <p>
                <i className="bi bi-info-circle" aria-hidden="true"></i>
                Contact your administrator for access credentials
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;