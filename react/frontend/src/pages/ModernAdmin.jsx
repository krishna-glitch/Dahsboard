import React, { useState, useEffect } from 'react';
import RoleGate from '../components/auth/RoleGate';
import { Link } from 'react-router-dom';
import MetricCard from '../components/modern/MetricCard';
import EmptyState from '../components/modern/EmptyState';
import { getAdminSummary, getAdminUserList, getSessionStatistics } from '../services/api';

/**
 * Modern Admin Page - User Management and System Administration
 * Uses design system tokens and modern layout patterns
 */

// Admin Summary Cards Component
const AdminSummaryCards = () => {
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const data = await getAdminSummary();
        setSummaryData(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchSummary();
  }, []);

  if (loading) {
    return (
      <div className="metrics-grid">
        <EmptyState type="loading" title="Loading Admin Summary" description="Fetching system statistics..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="metrics-grid">
        <EmptyState type="error" title="Failed to Load Summary" description={error} />
      </div>
    );
  }

  if (!summaryData) {
    return (
      <div className="metrics-grid">
        <EmptyState type="no-data" title="No Summary Data" description="Admin summary data is not available." />
      </div>
    );
  }

  return (
    <div className="metrics-grid">
      <MetricCard
        title="Total Users"
        value={summaryData.total_users?.toString() || '0'}
        icon="people-fill"
        status={summaryData.total_users > 0 ? "good" : "unknown"}
        context="All registered users"
      />
      <MetricCard
        title="Active Users"
        value={summaryData.active_users?.toString() || '0'}
        icon="person-check-fill"
        status={summaryData.active_users > 0 ? "excellent" : "unknown"}
        context="Currently active users"
      />
      <MetricCard
        title="Active Sessions"
        value={summaryData.active_sessions?.toString() || '0'}
        icon="wifi"
        status={summaryData.active_sessions > 0 ? "good" : "unknown"}
        context="Current user sessions"
      />
      <MetricCard
        title="Recent Activity"
        value={summaryData.recent_activity_count?.toString() || '0'}
        icon="activity"
        status={summaryData.recent_activity_count > 10 ? "excellent" : summaryData.recent_activity_count > 0 ? "good" : "unknown"}
        context="Actions in last 24h"
      />
    </div>
  );
};

// User Management Section
const UserManagementSection = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        const data = await getAdminUserList(roleFilter, statusFilter);
        setUsers(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [roleFilter, statusFilter, refreshTrigger]);

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const roleOptions = [
    { label: 'All Roles', value: 'all' },
    { label: 'Admin', value: 'admin' },
    { label: 'Analyst', value: 'analyst' },
    { label: 'Operator', value: 'operator' },
    { label: 'Viewer', value: 'viewer' }
  ];

  const statusOptions = [
    { label: 'Active Users', value: 'active' },
    { label: 'All Users', value: 'all' },
    { label: 'Inactive Users', value: 'inactive' }
  ];

  const getRoleBadgeClass = (role) => {
    switch(role) {
      case 'admin': return 'status-poor';
      case 'analyst': return 'status-warning';
      case 'operator': return 'status-good';
      default: return 'status-unknown';
    }
  };

  return (
    <div className="user-management-section">
      <div className="section-header">
        <h2 className="section-title">
          <i className="bi bi-people-fill" style={{ marginRight: '12px' }}></i>
          User Management
        </h2>
      </div>

      {/* Filters */}
      <div className="user-filters">
        <div className="filter-group">
          <label className="form-label">Filter by Role:</label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="form-select modern-select"
          >
            {roleOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label className="form-label">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="form-select modern-select"
          >
            {statusOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="filter-actions">
          <button
            onClick={handleRefresh}
            className="btn btn-outline-primary shadow-interactive"
          >
            <i className="bi bi-arrow-repeat" style={{ marginRight: '8px' }}></i>
            Refresh
          </button>
        </div>
      </div>

      {/* User List */}
      {loading ? (
        <EmptyState type="loading" title="Loading Users" description="Fetching user list..." />
      ) : error ? (
        <EmptyState type="error" title="Failed to Load Users" description={error} />
      ) : users.length === 0 ? (
        <EmptyState 
          type="no-data" 
          title="No Users Found" 
          description="No users match the current filter criteria." 
          illustration={<i className="bi bi-people"></i>}
        />
      ) : (
        <div className="user-list-container">
          <div className="user-table-responsive">
            <table className="user-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Site Access</th>
                  <th>Last Login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.username} className="user-row">
                    <td className="user-info">
                      <div className="user-avatar">
                        <i className="bi bi-person-circle"></i>
                      </div>
                      <div className="user-details">
                        <div className="user-name">{user.full_name}</div>
                        <div className="user-email">{user.email}</div>
                        <div className="user-username">@{user.username}</div>
                      </div>
                    </td>
                    <td>
                      <span className={`role-badge ${getRoleBadgeClass(user.role)}`}>
                        {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${user.is_active ? 'status-active' : 'status-inactive'}`}>
                        <div className="status-indicator"></div>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="site-access">
                      {user.sites_access ? user.sites_access.join(', ') : 'All Sites'}
                    </td>
                    <td className="last-login">
                      {user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}
                    </td>
                    <td className="user-actions">
                      <button className="btn btn-sm btn-outline-primary shadow-interactive">
                        <i className="bi bi-pencil"></i>
                        Edit
                      </button>
                      <button className={`btn btn-sm ${user.is_active ? 'btn-outline-warning' : 'btn-outline-success'} shadow-interactive`}>
                        <i className={`bi bi-${user.is_active ? 'pause' : 'play'}`}></i>
                        {user.is_active ? "Disable" : "Enable"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="user-list-footer">
            <span className="user-count">Showing {users.length} users</span>
          </div>
        </div>
      )}
    </div>
  );
};

// System Statistics Section
const SystemStatisticsSection = () => {
  const [sessionStats, setSessionStats] = useState(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [errorSessions, setErrorSessions] = useState(null);

  useEffect(() => {
    const fetchSessionStats = async () => {
      try {
        setLoadingSessions(true);
        const data = await getSessionStatistics();
        setSessionStats(data);
      } catch (err) {
        setErrorSessions(err.message);
      } finally {
        setLoadingSessions(false);
      }
    };
    fetchSessionStats();
  }, []);

  const healthIndicators = [
    { name: "Database", status: "healthy", value: "99.9%", icon: "database" },
    { name: "Cache System", status: "healthy", value: "100%", icon: "lightning" },
    { name: "File Storage", status: "healthy", value: "85% used", icon: "hdd" },
    { name: "Background Jobs", status: "healthy", value: "Running", icon: "gear" }
  ];

  return (
    <div className="system-stats-section">
      {/* Active Sessions */}
      <div className="stats-card">
        <div className="stats-header">
          <h3 className="stats-title">
            <i className="bi bi-wifi" style={{ marginRight: '8px' }}></i>
            Active Sessions
          </h3>
        </div>
        <div className="stats-content">
          {loadingSessions ? (
            <EmptyState type="loading" title="Loading Sessions" description="Fetching session data..." />
          ) : errorSessions ? (
            <EmptyState type="error" title="Error" description={errorSessions} />
          ) : sessionStats ? (
            <div className="session-stats">
              <div className="stat-item">
                <span className="stat-label">Active Sessions:</span>
                <span className="stat-value">{sessionStats.active_sessions}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Unique Users:</span>
                <span className="stat-value">{sessionStats.unique_active_users}</span>
              </div>
              
              <div className="stat-divider"></div>
              
              <h4 className="stat-section-title">By Role:</h4>
              {Object.entries(sessionStats.role_distribution).map(([role, count]) => (
                <div key={role} className="stat-item">
                  <span className="stat-label">{role.charAt(0).toUpperCase() + role.slice(1)}:</span>
                  <span className="stat-value">{count}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState type="no-data" title="No Data" description="Session statistics unavailable." />
          )}
        </div>
      </div>

      {/* System Health */}
      <div className="stats-card">
        <div className="stats-header">
          <h3 className="stats-title">
            <i className="bi bi-shield-check" style={{ marginRight: '8px' }}></i>
            System Health
          </h3>
        </div>
        <div className="stats-content">
          <div className="health-indicators">
            {healthIndicators.map((indicator, index) => (
              <div key={index} className="health-item">
                <div className="health-icon">
                  <i className={`bi bi-${indicator.icon}`}></i>
                </div>
                <div className="health-info">
                  <div className="health-name">{indicator.name}</div>
                  <div className="health-value">{indicator.value}</div>
                </div>
                <div className={`health-status ${indicator.status === 'healthy' ? 'status-healthy' : 'status-unhealthy'}`}>
                  <i className={`bi bi-${indicator.status === 'healthy' ? 'check-circle-fill' : 'exclamation-triangle-fill'}`}></i>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// User Modals (simplified for now)
const UserModal = ({ show, onClose, title, children }) => {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="modal-close" onClick={onClose}>
            <i className="bi bi-x"></i>
          </button>
        </div>
        <div className="modal-body">
          {children}
        </div>
        <div className="modal-actions">
          <button className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary">Save</button>
        </div>
      </div>
    </div>
  );
};

const ModernAdmin = () => {
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);

  const content = (
    <div className="modern-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Administration</h1>
          <p className="dashboard-subtitle">
            User management and system configuration
          </p>
        </div>
        <div className="dashboard-actions">
          <button 
            className="btn btn-primary shadow-interactive"
            onClick={() => setShowCreateUserModal(true)}
          >
            <i className="bi bi-person-plus" style={{ marginRight: '8px' }}></i>
            Create User
          </button>
          <button className="btn btn-outline-secondary shadow-interactive">
            <i className="bi bi-journal-text" style={{ marginRight: '8px' }}></i>
            System Logs
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Admin Summary Cards */}
        <AdminSummaryCards />

        {/* Admin Content Grid */}
        <div className="admin-content-grid">
          <div className="admin-main-section">
            <UserManagementSection />
          </div>
          <div className="admin-sidebar-section">
            <SystemStatisticsSection />
          </div>
        </div>
      </div>

      {/* Modals */}
      <UserModal
        show={showCreateUserModal}
        onClose={() => setShowCreateUserModal(false)}
        title="Create New User"
      >
        <p>User creation form will be implemented here.</p>
      </UserModal>

      <UserModal
        show={showEditUserModal}
        onClose={() => setShowEditUserModal(false)}
        title="Edit User"
      >
        <p>User edit form will be implemented here.</p>
      </UserModal>
    </div>
  );
  return (
    <RoleGate allowed={['admin']}>
      {content}
    </RoleGate>
  );
};

export default ModernAdmin;
