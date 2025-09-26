import React, { useEffect, useState } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { useAuth } from '../contexts/authUtils';
import { useNavigate, useLocation } from 'react-router-dom';
import { LoginFormData } from '../types/forms';
import { createLoginValidation } from '../utils/formValidation';
import styles from './Login.module.css';

interface LoginFormProps {}

interface LocationState {
  from?: {
    pathname: string;
  };
}

// Get validation rules from utility
const loginValidationRules = createLoginValidation();

const formatServerError = (result: { error?: string; code?: string; meta?: Record<string, unknown> }) => {
  if (!result) {
    return 'Login failed';
  }
  if (result.code === 'ACCOUNT_LOCKED') {
    const retryAfter = Number(result.meta?.retryAfter ?? 0);
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      const minutes = Math.ceil(retryAfter / 60);
      return `Too many failed attempts. Try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`;
    }
    return 'Too many failed attempts. Please try again later.';
  }
  if (result.code === 'INVALID_CREDENTIALS') {
    return 'Invalid username or password.';
  }
  return result.error || 'Login failed';
};

const Login: React.FC<LoginFormProps> = () => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
    setError
  } = useForm<LoginFormData>({
    mode: 'onChange',
    defaultValues: {
      username: '',
      password: ''
    }
  });

  const [showPassword, setShowPassword] = useState<boolean>(false);

  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: LocationState };

  const from = location.state?.from?.pathname || '/';


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
        const message = formatServerError(result);
        setError('root.serverError', {
          type: 'server',
          message,
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
    <div className={styles.loginContainer}>
      <div className={styles.authWrapper}>
        <div className={styles.authVisual}>
          <div className={styles.brand}>
            <div className={styles.brandLogo} aria-hidden="true">
              <div className={styles.logoIcon}>
                <i className="bi bi-droplet-fill"></i>
              </div>
            </div>
            <h1 className={styles.brandTitle}>Environmental Monitoring</h1>
            <p className={styles.brandSubtitle}>Water Quality Analytics Platform</p>
          </div>

          <div className={styles.visualElements} aria-hidden="true">
            <div className={`${styles.floatingElement} ${styles.element1}`}>
              <i className="bi bi-graph-up"></i>
            </div>
            <div className={`${styles.floatingElement} ${styles.element2}`}>
              <i className="bi bi-water"></i>
            </div>
            <div className={`${styles.floatingElement} ${styles.element3}`}>
              <i className="bi bi-shield-check"></i>
            </div>
          </div>
        </div>

        <div className={styles.authFormContainer}>
          <div className={styles.authForm}>
            <div className={styles.authHeader}>
              <h2>Welcome Back</h2>
              <p>Sign in to access your monitoring dashboard</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className={styles.loginForm} noValidate>
              {/* Server Error Display */}
              {errors.root?.serverError && (
                <div className={styles.errorBanner} role="alert">
                  <i className="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
                  <span>{errors.root.serverError.message}</span>
                </div>
              )}

              {/* Username Field */}
              <div className={styles.formGroup}>
                <label htmlFor="username" className={styles.formLabel}>
                  Username
                  <span className={styles.requiredIndicator} aria-label="required">*</span>
                </label>
                <div className={styles.inputWrapper}>
                  <div className={styles.inputIcon}>
                    <i className="bi bi-person" aria-hidden="true"></i>
                  </div>
                  <input
                    {...register('username', loginValidationRules.username)}
                    type="text"
                    id="username"
                    className={`${styles.formInput} ${errors.username ? styles.formInputError : ''}`}
                    placeholder="Enter your username"
                    autoComplete="username"
                    aria-invalid={errors.username ? 'true' : 'false'}
                    aria-describedby={errors.username ? 'username-error' : undefined}
                  />
                </div>
                {errors.username && (
                  <div id="username-error" className={styles.errorMessage} role="alert">
                    <i className="bi bi-exclamation-circle" aria-hidden="true"></i>
                    {errors.username.message}
                  </div>
                )}
              </div>

              {/* Password Field */}
              <div className={styles.formGroup}>
                <label htmlFor="password" className={styles.formLabel}>
                  Password
                  <span className={styles.requiredIndicator} aria-label="required">*</span>
                </label>
                <div className={styles.inputWrapper}>
                  <div className={styles.inputIcon}>
                    <i className="bi bi-lock" aria-hidden="true"></i>
                  </div>
                  <input
                    {...register('password', loginValidationRules.password)}
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    className={`${styles.formInput} ${errors.password ? styles.formInputError : ''}`}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    aria-invalid={errors.password ? 'true' : 'false'}
                    aria-describedby={errors.password ? 'password-error' : undefined}
                  />
                  <button
                    type="button"
                    className={styles.passwordToggle}
                    onClick={togglePasswordVisibility}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`} aria-hidden="true"></i>
                  </button>
                </div>
                {errors.password && (
                  <div id="password-error" className={styles.errorMessage} role="alert">
                    <i className="bi bi-exclamation-circle" aria-hidden="true"></i>
                    {errors.password.message}
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className={`${styles.loginButton} ${isSubmitting ? styles.loginButtonLoading : ''}`}
                disabled={isSubmitting || !isValid}
                aria-describedby="login-button-status"
              >
                {isSubmitting ? (
                  <>
                    <span className={styles.spinner} aria-hidden="true"></span>
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
            <div className={styles.authFooter}>
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