import React from 'react';

/**
 * Progressive loading bar showing real data processing progress
 * Much better than fake streaming - shows actual work being done
 */
const ProgressiveLoadingBar = ({ 
  loadingState,
  onCancel,
  className = ''
}) => {
  const {
    isLoading,
    phase,
    progress,
    currentStep,
    totalPoints,
    processedPoints,
    startTime
  } = loadingState;

  if (!isLoading) return null;

  // Calculate loading rate
  const elapsedTime = startTime ? (Date.now() - startTime) / 1000 : 0;
  const loadingRate = processedPoints > 0 && elapsedTime > 0 
    ? Math.round(processedPoints / elapsedTime) 
    : 0;

  // Phase indicators
  const phaseConfig = {
    fetching: {
      icon: 'cloud-download',
      color: '#3498db',
      label: 'Fetching'
    },
    parsing: {
      icon: 'file-earmark-text',
      color: '#f39c12',
      label: 'Parsing'
    },
    processing: {
      icon: 'cpu',
      color: '#e74c3c',
      label: 'Processing'
    },
    rendering: {
      icon: 'graph-up',
      color: '#27ae60',
      label: 'Rendering'
    }
  };

  const currentPhaseConfig = phaseConfig[phase] || phaseConfig.fetching;

  return (
    <div className={`progressive-loading-container ${className}`}>
      <div className="loading-header">
        <div className="phase-indicator">
          <i 
            className={`bi bi-${currentPhaseConfig.icon}`}
            style={{ color: currentPhaseConfig.color }}
          ></i>
          <span className="phase-label">{currentPhaseConfig.label}</span>
          {onCancel && (
            <button 
              className="btn btn-sm btn-outline-secondary ms-2"
              onClick={onCancel}
              title="Cancel Loading"
            >
              <i className="bi bi-x"></i>
            </button>
          )}
        </div>
        
        <div className="progress-stats">
          {processedPoints > 0 ? (
            <span className="points-count">
              {processedPoints.toLocaleString()}{totalPoints > 0 && ` / ${totalPoints.toLocaleString()}`} points
            </span>
          ) : (
            <span className="estimating">Estimating...</span>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="progress-container">
        <div className="progress-bg">
          <div 
            className="progress-fill"
            style={{ 
              width: `${Math.max(2, progress)}%`,
              backgroundColor: currentPhaseConfig.color
            }}
          >
            <div className="progress-glow"></div>
          </div>
        </div>
        <div className="progress-text">
          {progress.toFixed(0)}%
        </div>
      </div>

      {/* Current Step */}
      <div className="current-step">
        <span className="step-text">{currentStep}</span>
        {loadingRate > 0 && (
          <span className="loading-rate">
            ({loadingRate.toLocaleString()} pts/sec)
          </span>
        )}
      </div>

      <style>
        {`
        .progressive-loading-container {
          background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
          border: 1px solid #e9ecef;
          border-radius: 12px;
          padding: 1.25rem;
          margin: 1rem 0;
          box-shadow: 0 4px 20px rgba(0,0,0,0.08);
          backdrop-filter: blur(10px);
        }

        .loading-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .phase-indicator {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .phase-indicator i {
          font-size: 1.2rem;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        .phase-label {
          font-weight: 600;
          color: #2c3e50;
          font-size: 0.95rem;
        }

        .progress-stats {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 0.85rem;
        }

        .points-count {
          color: #27ae60;
          font-weight: 600;
        }

        .estimating {
          color: #7f8c8d;
          font-style: italic;
        }

        .progress-container {
          position: relative;
          margin-bottom: 0.75rem;
        }

        .progress-bg {
          height: 6px;
          background: #ecf0f1;
          border-radius: 3px;
          overflow: hidden;
          position: relative;
        }

        .progress-fill {
          height: 100%;
          border-radius: 3px;
          position: relative;
          transition: width 0.3s ease;
          overflow: hidden;
        }

        .progress-glow {
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, 
            transparent, 
            rgba(255,255,255,0.4), 
            transparent
          );
          animation: shimmer 2s infinite;
        }

        @keyframes shimmer {
          0% { left: -100%; }
          100% { left: 100%; }
        }

        .progress-text {
          position: absolute;
          top: -1.5rem;
          right: 0;
          font-size: 0.8rem;
          font-weight: 600;
          color: #34495e;
        }

        .current-step {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.85rem;
          margin-top: 0.5rem;
        }

        .step-text {
          color: #2c3e50;
          font-weight: 500;
        }

        .loading-rate {
          color: #7f8c8d;
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 0.8rem;
        }

        /* Responsive design */
        @media (max-width: 768px) {
          .loading-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
          }

          .current-step {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.25rem;
          }
        }

        /* Dark mode support */
        @media (prefers-color-scheme: dark) {
          .progressive-loading-container {
            background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
            border-color: #4a5568;
          }

          .phase-label,
          .step-text,
          .progress-text {
            color: #ecf0f1;
          }

          .progress-bg {
            background: #4a5568;
          }
        }
        `}
      </style>
    </div>
  );
};

export default ProgressiveLoadingBar;