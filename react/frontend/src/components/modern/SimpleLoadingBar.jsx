import React, { useState, useEffect, useRef } from 'react';
import './SimpleLoadingBar.css';

/**
 * Enhanced Loading Bar - Shows real progress with percentage and data counts
 * Includes cache hit detection for instant loading feedback
 */
const SimpleLoadingBar = ({
  isVisible = false,
  message = 'Loading...',
  stage = 'loading',
  compact = false,
  progress = null, // 0-100 percentage
  current = null, // current loaded items
  total = null, // total items to load
  showPercentage = true,
  showCounts = true
}) => {
  const [displayProgress, setDisplayProgress] = useState(0);
  const [displayCurrent, setDisplayCurrent] = useState(0);
  const [isCacheHit, setIsCacheHit] = useState(false);
  const loadStartTime = useRef(null);

  useEffect(() => {
    if (!isVisible) {
      setDisplayProgress(0);
      setDisplayCurrent(0);
      setIsCacheHit(false);
      loadStartTime.current = null;
      return;
    }

    // Track load start time for cache hit detection
    if (loadStartTime.current === null) {
      loadStartTime.current = Date.now();
    }

    // Auto-calculate progress from current/total if not provided directly
    let targetProgress = progress;
    if (targetProgress === null && current !== null && total !== null && total > 0) {
      targetProgress = Math.round((current / total) * 100);
    }

    // Fallback indeterminate progress if no real data
    if (targetProgress === null) {
      targetProgress = null; // Keep indeterminate
    }

    if (targetProgress !== null) {
      setDisplayProgress(targetProgress);
    }

    if (current !== null) {
      setDisplayCurrent(current);
    }
  }, [isVisible, progress, current, total]);

  // Detect cache hit when loading completes quickly
  useEffect(() => {
    if (!isVisible && loadStartTime.current !== null) {
      const loadDuration = Date.now() - loadStartTime.current;
      console.log(`[Loading] Duration: ${loadDuration}ms`); // Debug timing
      if (loadDuration < 300) { // Less than 300ms = likely cache hit (reduced threshold)
        setIsCacheHit(true);
        setTimeout(() => setIsCacheHit(false), 3000); // Show for 3 seconds
      }
      loadStartTime.current = null;
    }
  }, [isVisible]);

  if (!isVisible) return null;

  const stageIcons = {
    initializing: 'bi-arrow-repeat',
    loading: 'bi-cloud-download',
    processing: 'bi-gear',
    cache_check: 'bi-search',
    database_query: 'bi-database',
    finalizing: 'bi-check-circle',
    cache_hit: 'bi-lightning-charge'
  };

  // Use cache hit icon and message if detected
  const icon = isCacheHit ? stageIcons.cache_hit : (stageIcons[stage] || stageIcons.loading);
  const displayMessage = isCacheHit ? 'Loaded from cache ⚡' : message;
  const hasRealProgress = displayProgress !== null && displayProgress >= 0;
  const hasCountData = current !== null && total !== null;

  // Show cache hit notification briefly after fast loading
  if (isCacheHit && !isVisible) {
    return (
      <div className={`enhanced-loading-bar cache-hit ${compact ? 'compact' : ''}`}>
        <div className="loading-content">
          <div className="loading-header">
            <div className="loading-left">
              <div className="loading-icon">
                <i className="bi bi-lightning-charge"></i>
              </div>
              <div className="loading-message">Data loaded from cache ⚡</div>
            </div>
            <div className="loading-right">
              <div className="cache-hit-badge">CACHED</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`enhanced-loading-bar ${compact ? 'compact' : ''}`}>
      <div className="loading-content">
        <div className="loading-header">
          <div className="loading-left">
            <div className="loading-icon">
              <i className={`bi ${icon}`}></i>
            </div>
            <div className="loading-message">{displayMessage}</div>
          </div>

          <div className="loading-right">
            {hasCountData && showCounts && (
              <div className="loading-counts">
                {displayCurrent.toLocaleString()} / {total.toLocaleString()}
              </div>
            )}
            {hasRealProgress && showPercentage && (
              <div className="loading-percentage">
                {displayProgress}%
              </div>
            )}
          </div>
        </div>

        <div className="progress-bar-wrapper">
          <div className="progress-bar-track">
            {hasRealProgress ? (
              // Determinate progress bar
              <div
                className="progress-bar-fill determinate"
                style={{ width: `${displayProgress}%` }}
              >
                <div className="progress-bar-shine"></div>
              </div>
            ) : (
              // Indeterminate progress bar
              <div className="progress-bar-fill indeterminate"></div>
            )}
          </div>
        </div>

        {compact && hasCountData && (
          <div className="compact-info">
            {displayCurrent.toLocaleString()} of {total.toLocaleString()} loaded
          </div>
        )}
      </div>
    </div>
  );
};

export default SimpleLoadingBar;