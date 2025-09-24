import React from 'react';
import PropTypes from 'prop-types';
const formatNumber = (value, digits = 2) => {
  if (value == null || Number.isNaN(value)) return '—';
  return Number(value).toFixed(digits);
};

const ParameterSummaryCard = ({ title, stats, unit }) => (
  <div className="stats-card">
    <h4 className="stats-card-title">{title}</h4>
    <dl className="stats-card-list">
      <div>
        <dt>Count</dt>
        <dd>{stats.count.toLocaleString()}</dd>
      </div>
      <div>
        <dt>Missing</dt>
        <dd>{stats.missing.toLocaleString()}</dd>
      </div>
      <div>
        <dt>Mean</dt>
        <dd>{formatNumber(stats.mean)}{unit}</dd>
      </div>
      <div>
        <dt>Median</dt>
        <dd>{formatNumber(stats.median)}{unit}</dd>
      </div>
      <div>
        <dt>Std Dev</dt>
        <dd>{formatNumber(stats.stdDev)}{unit}</dd>
      </div>
      <div>
        <dt>Min</dt>
        <dd>{formatNumber(stats.min)}{unit}</dd>
      </div>
      <div>
        <dt>Max</dt>
        <dd>{formatNumber(stats.max)}{unit}</dd>
      </div>
    </dl>
  </div>
);

const ParameterSiteTable = ({ parameterKey, label, unit, siteStats }) => {
  const siteEntries = Object.entries(siteStats || {});
  if (siteEntries.length === 0) return null;
  return (
    <div className="stats-table-wrapper">
      <h5 className="stats-table-title">{label} by Site</h5>
      <table className="stats-table">
        <thead>
          <tr>
            <th scope="col">Site</th>
            <th scope="col">Count</th>
            <th scope="col">Mean {unit}</th>
            <th scope="col">Median {unit}</th>
            <th scope="col">Std Dev {unit}</th>
            <th scope="col">Min {unit}</th>
            <th scope="col">Max {unit}</th>
          </tr>
        </thead>
        <tbody>
          {siteEntries.map(([site, stats]) => (
            <tr key={`${parameterKey}-${site}`}>
              <th scope="row">{site}</th>
              <td>{stats.count.toLocaleString()}</td>
              <td>{formatNumber(stats.mean)}</td>
              <td>{formatNumber(stats.median)}</td>
              <td>{formatNumber(stats.stdDev)}</td>
              <td>{formatNumber(stats.min)}</td>
              <td>{formatNumber(stats.max)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const WaterQualityStatsPanel = ({ stats, parameterConfig }) => {
  if (!stats || stats.parameterKeys.length === 0) {
    return (
      <div className="stats-empty">
        <i className="bi bi-bar-chart"></i>
        <p>No statistical data available for the current selection.</p>
      </div>
    );
  }

  return (
    <div className="stats-panel">
      <section className="stats-section">
        <h3 className="stats-section-title">Global Summary</h3>
        <div className="stats-card-grid">
          {stats.parameterKeys.map((paramKey) => {
            const config = parameterConfig[paramKey] || {};
            return (
              <ParameterSummaryCard
                key={`summary-${paramKey}`}
                title={config.label || paramKey}
                stats={stats.global[paramKey]}
                unit={config.unit ? ` ${config.unit}` : ''}
              />
            );
          })}
        </div>
      </section>

      <section className="stats-section">
        <h3 className="stats-section-title">Per-Site Detail</h3>
        {stats.parameterKeys.map((paramKey) => {
          const config = parameterConfig[paramKey] || {};
          return (
            <ParameterSiteTable
              key={`per-site-${paramKey}`}
              parameterKey={paramKey}
              label={config.label || paramKey}
              unit={config.unit ? ` (${config.unit})` : ''}
              siteStats={stats.perSite[paramKey]}
            />
          );
        })}
      </section>
    </div>
  );
};

WaterQualityStatsPanel.propTypes = {
  stats: PropTypes.shape({
    global: PropTypes.object.isRequired,
    perSite: PropTypes.object.isRequired,
    parameterKeys: PropTypes.arrayOf(PropTypes.string).isRequired,
  }).isRequired,
  parameterConfig: PropTypes.object.isRequired,
};

ParameterSummaryCard.propTypes = {
  title: PropTypes.string.isRequired,
  stats: PropTypes.shape({
    count: PropTypes.number.isRequired,
    missing: PropTypes.number.isRequired,
    min: PropTypes.number,
    max: PropTypes.number,
    mean: PropTypes.number,
    median: PropTypes.number,
    stdDev: PropTypes.number,
  }).isRequired,
  unit: PropTypes.string,
};

ParameterSummaryCard.defaultProps = {
  unit: '',
};

ParameterSiteTable.propTypes = {
  parameterKey: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  unit: PropTypes.string,
  siteStats: PropTypes.object,
};

ParameterSiteTable.defaultProps = {
  unit: '',
  siteStats: {},
};

export default WaterQualityStatsPanel;
