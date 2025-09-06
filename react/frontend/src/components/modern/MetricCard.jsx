import React from 'react';
import Icon from './Icon';
import styles from './MetricCard.module.css';

/**
 * Modern Metric Card Component - Using Design System Tokens
 * Professional card component with consistent theming
 */
const MetricCard = ({ 
  title, 
  value, 
  unit = '', 
  icon = null, 
  trend = null,
  context = null,
  progress = null, // { value, max, label }
  status = 'normal', // normal, good, fair, poor, unknown
  className = '',
  tooltip = null,
  flippable = false,
  backContent = null,
}) => {
  const statusToClass = () => {
    switch (status) {
      case 'excellent': return styles.statusExcellent;
      case 'good': return styles.statusGood;
      case 'fair': return styles.statusFair;
      case 'poor': return styles.statusPoor;
      case 'unknown':
      default:
        return '';
    }
  };

  const getTrendClass = () => {
    if (!trend) return '';
    if (trend > 0) return styles.positive;
    if (trend < 0) return styles.negative;
    return styles.neutral;
  };

  const getTrendIcon = () => {
    if (!trend) return '';
    if (trend > 0) return '↗';
    if (trend < 0) return '↘';
    return '→';
  };

  const statusClass = statusToClass();

  const Front = (
    <div className={styles.flipFace} aria-hidden={false}>
      <div className={styles.metricCardHeader}>
        <h3 className={styles.metricCardTitle}>{title}</h3>
        {icon && (
          <div className={styles.metricCardIcon}>
            {typeof icon === 'string' ? (
              <Icon name={icon} size="var(--icon-size-medium)" />
            ) : (
              icon
            )}
          </div>
        )}
      </div>
      <div className={styles.metricCardValue}>
        {value}
        {unit && <span className={styles.metricCardUnit}>{unit}</span>}
      </div>
      {trend && (
        <div className={styles.metricCardTrend}>
          <span className={`${styles.metricCardTrendIndicator} ${getTrendClass()}`}>{getTrendIcon()}</span>
          <span className={styles.metricCardTrendText}>{Math.abs(trend)}% from last period</span>
        </div>
      )}
      {progress && (
        <div className={styles.metricProgress}>
          <div className={styles.progressBar}>
            <div className={`${styles.progressFill} ${statusClass}`} style={{ width: `${Math.min((progress.value / progress.max) * 100, 100)}%` }}></div>
          </div>
          {progress.label && (<div className={styles.progressLabel}>{progress.label}</div>)}
        </div>
      )}
      {context && (<p className={styles.metricCardContext}>{context}</p>)}
    </div>
  );

  if (!flippable || !backContent) {
    return (
      <div className={`${styles.metricCard} ${styles.componentFadeIn} ${className || ''}`} title={typeof tooltip === 'string' ? tooltip : undefined}>
        {Front}
      </div>
    );
  }

  return (
    <div className={`${styles.metricCard} ${styles.componentFadeIn} ${styles.flippable} ${className || ''}`} title={typeof tooltip === 'string' ? tooltip : undefined}>
      <div className={styles.flipInner}>
        {Front}
        <div className={`${styles.flipFace} ${styles.flipBack}`} aria-hidden={true}>
          {backContent}
        </div>
      </div>
    </div>
  );
};

// Memoize MetricCard to prevent re-renders when props haven't changed
export default React.memo(MetricCard);
