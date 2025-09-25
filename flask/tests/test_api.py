import pytest
from unittest.mock import patch, MagicMock
from migration.flask.app import create_app
from flask_login import FlaskLoginClient
import pandas as pd
from datetime import datetime, timedelta

# Mock data for services
MOCK_USER_DATA = {
    'testuser': {'id': 1, 'username': 'testuser', 'password': 'hashed_password', 'role': 'admin', 'is_active': True},
    'analyst': {'id': 2, 'username': 'analyst', 'password': 'hashed_password', 'role': 'analyst', 'is_active': True},
    'viewer': {'id': 3, 'username': 'viewer', 'password': 'hashed_password', 'role': 'viewer', 'is_active': True},
}

MOCK_WQ_DATA = pd.DataFrame({
    'measurement_timestamp': [datetime.now() - timedelta(days=i) for i in range(10)],
    'site_code': ['S1', 'S2', 'S1', 'S2', 'S1', 'S2', 'S1', 'S2', 'S1', 'S2'],
    'ph': [7.0, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9],
    'temperature_c': [20.0, 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8, 20.9]
})

MOCK_ALERTS_DATA = [
    {'alert_id': 'A1', 'site_code': 'S1', 'severity': 'critical', 'message': 'High pH', 'timestamp': datetime.now()},
    {'alert_id': 'A2', 'site_code': 'S2', 'severity': 'high', 'message': 'Low DO', 'timestamp': datetime.now()},
]


class MockUser:
    def __init__(self, user_id, username, role):
        self.id = user_id
        self.username = username
        self.role = role
        self.is_active = True

    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False

    def get_id(self):
        return str(self.id)

@pytest.fixture
def client():
    app = create_app()
    app.test_client_class = FlaskLoginClient # Use FlaskLoginClient for testing login
    with app.test_client() as client:
        yield client

# Fixture to mock user_manager and auth service for authentication tests
@pytest.fixture(autouse=True)
def mock_auth_services():
    with patch('api.auth.user_manager', autospec=True) as mock_user_manager, \
         patch('api.auth.auth_service', autospec=True) as mock_auth_service, \
         patch('services.user_management.user_manager', autospec=True) as mock_legacy_user_manager, \
         patch('services.new_user_management.NewUserManager.get_user_by_id', autospec=True) as mock_get_user_by_id:

        def get_user(db, username):
            user_data = MOCK_USER_DATA.get(username)
            return MockUser(user_data['id'], user_data['username'], user_data['role']) if user_data else None

        mock_user_manager.get_user_by_username.side_effect = get_user

        def authenticate_user(db, username, password):
            user_data = MOCK_USER_DATA.get(username)
            if user_data and password == 'testpassword':
                return True, MockUser(user_data['id'], user_data['username'], user_data['role'])
            return False, None

        mock_auth_service.authenticate_user.side_effect = authenticate_user
        mock_auth_service.logout_user = MagicMock()

        def lookup_user(identifier):
            if identifier is None:
                return None

            key = identifier
            if isinstance(identifier, str) and identifier.isdigit():
                for record in MOCK_USER_DATA.values():
                    if str(record['id']) == identifier:
                        key = record['username']
                        break

            user_data = MOCK_USER_DATA.get(key)
            if not user_data:
                return None
            return {
                'username': user_data['username'],
                'role': user_data['role'],
                'is_active': user_data.get('is_active', True),
                'last_login': datetime.now()
            }

        mock_legacy_user_manager.get_user_by_username.side_effect = lookup_user
        mock_legacy_user_manager.get_user_list.return_value = [
            {
                'username': record['username'],
                'role': record['role'],
                'is_active': record.get('is_active', True),
                'last_login': datetime.now()
            }
            for record in MOCK_USER_DATA.values()
        ]
        mock_legacy_user_manager.get_session_statistics.return_value = {
            'active_sessions': 2,
            'total_sessions_today': 5,
            'average_session_duration_minutes': 45
        }
        mock_legacy_user_manager.get_user_activity_log.return_value = [
            {
                'username': 'testuser',
                'action': 'login',
                'timestamp': datetime.now(),
                'ip_address': '127.0.0.1'
            }
        ]

        def lookup_user_by_id(cls, db, user_id):
            for record in MOCK_USER_DATA.values():
                if str(record['id']) == str(user_id):
                    return MockUser(record['id'], record['username'], record['role'])
            return None

        mock_get_user_by_id.side_effect = lookup_user_by_id

        yield

# Fixture to mock core_data_service and alert_engine for data fetching tests
@pytest.fixture(autouse=True)
def mock_data_services():
    with patch('services.core_data_service.core_data_service', autospec=True) as mock_core_data_service,\
         patch('services.alert_engine.alert_engine', autospec=True) as mock_alert_engine,\
         patch('services.consolidated_cache_service.cache_service', autospec=True) as mock_cache_service,\
         patch('utils.callback_optimizer.callback_optimizer', autospec=True) as mock_callback_optimizer,\
         patch('utils.chart_performance_optimizer.chart_optimizer', autospec=True) as mock_chart_optimizer,\
         patch('services.cache_prewarmer.cache_prewarmer', autospec=True) as mock_cache_prewarmer,\
         patch('config.database.db.execute_query', autospec=True) as mock_execute_query,\
         patch('services.database_date_service.database_date_service', autospec=True) as mock_date_service:

        # Mock for water_quality data
        mock_core_data_service.load_water_quality_data.return_value = MOCK_WQ_DATA
        
        # Mock for alerts data
        mock_alert_engine.get_alert_statistics.return_value = {'total_alerts': 2, 'resolution_rate': 50, 'severity_breakdown': {}, 'site_breakdown': {}, 'alerts_per_day': 1}
        mock_alert_engine.get_active_alerts.return_value = MOCK_ALERTS_DATA

        # Mock for performance data
        mock_cache_service.get_detailed_stats.return_value = {
            'hit_rate_percent': 90,
            'memory_usage_mb': 100,
            'memory_limit_mb': 1024,
        }
        mock_callback_optimizer.get_optimization_stats.return_value = {'total_optimizations': 5}
        mock_chart_optimizer.get_performance_stats.return_value = {'charts_optimized': 10, 'data_points_reduced': 1000}
        mock_cache_prewarmer.get_prewarming_stats.return_value = {'cache_entries_created': 20, 'is_currently_prewarming': False}

        mock_date_service.get_database_latest_date.return_value = datetime.now()
        mock_date_service.get_date_range_for_period.side_effect = lambda period: (
            datetime.now() - timedelta(days=7), datetime.now()
        )

        sites_df = pd.DataFrame({
            'site_id': ['S1', 'S2'],
            'status': ['active', 'active']
        })
        latest_df = pd.DataFrame({'latest': [datetime.now()]})
        recent_count_df = pd.DataFrame({'count': [len(MOCK_WQ_DATA)]})
        activity_df = pd.DataFrame({
            'measurement_timestamp': [datetime.now() - timedelta(hours=i) for i in range(5)],
            'site_code': ['S1', 'S2', 'S1', 'S2', 'S1'],
            'activity_type': ['Water Quality Measurement'] * 5
        })

        def fake_execute_query(query, params=None):
            if 'FROM impact.site' in query:
                return sites_df
            if 'MAX(measurement_timestamp)' in query:
                return latest_df
            if 'COUNT(*) AS count' in query:
                return recent_count_df
            if 'SELECT wq.measurement_timestamp' in query:
                return activity_df
            return pd.DataFrame()

        mock_execute_query.side_effect = fake_execute_query

        yield mock_core_data_service, mock_alert_engine, mock_cache_service, mock_callback_optimizer, mock_chart_optimizer, mock_cache_prewarmer


def test_home_data_endpoint_unauthenticated(client):
    """Test that /api/v1/home/data returns 401 Unauthorized when not logged in."""
    response = client.get('/api/v1/home/data')
    assert response.status_code == 401
    assert response.json == {'error': 'Unauthorized', 'message': 'Authentication required to access this resource.'}

def test_login_and_home_data_endpoint(client):
    """Test successful login and access to protected /api/v1/home/data endpoint."""
    login_data = {'username': 'testuser', 'password': 'testpassword'}
    client.post('/api/v1/auth/login', json=login_data)

    response = client.get('/api/v1/home/data')
    assert response.status_code == 200
    assert 'dashboard_data' in response.json
    assert 'metadata' in response.json

def test_404_not_found(client):
    """Test the custom 404 Not Found handler."""
    response = client.get('/api/v1/nonexistent_endpoint')
    assert response.status_code == 404
    assert response.json == {'error': 'Not Found', 'message': 'The requested URL was not found on the server.'}

def test_405_method_not_allowed(client):
    """Test the custom 405 Method Not Allowed handler."""
    response = client.post('/api/v1/home/data') # GET is allowed, POST is not
    assert response.status_code == 405
    assert response.json == {'error': 'Method Not Allowed', 'message': 'The method is not allowed for the requested URL.'}

# --- New Tests for Water Quality API ---
def test_water_quality_data_unauthenticated(client):
    """Test that /api/v1/water_quality/data returns 401 Unauthorized when not logged in."""
    response = client.get('/api/v1/water_quality/data')
    assert response.status_code == 401
    assert response.json == {'error': 'Unauthorized', 'message': 'Authentication required to access this resource.'}

def test_water_quality_data_authenticated(client):
    """Test successful access to /api/v1/water_quality/data when logged in."""
    login_data = {'username': 'testuser', 'password': 'testpassword'}
    client.post('/api/v1/auth/login', json=login_data)

    response = client.get('/api/v1/water_quality/data?sites=S1&time_range=Last%207%20Days')
    assert response.status_code == 200
    assert 'water_quality_data' in response.json
    assert 'metadata' in response.json
    assert response.json['metadata']['record_count'] == len(MOCK_WQ_DATA)

# --- New Tests for Alerts API ---
def test_alerts_data_unauthenticated(client):
    """Test that /api/v1/alerts/data returns 401 Unauthorized when not logged in."""
    response = client.get('/api/v1/alerts/data')
    assert response.status_code == 401
    assert response.json == {'error': 'Unauthorized', 'message': 'Authentication required to access this resource.'}

def test_alerts_data_authenticated(client):
    """Test successful access to /api/v1/alerts/data when logged in."""
    login_data = {'username': 'testuser', 'password': 'testpassword'}
    client.post('/api/v1/auth/login', json=login_data)

    response = client.get('/api/v1/alerts/data?sites=S1&time_range=Last%207%20Days')
    assert response.status_code == 200
    assert 'active_alerts' in response.json
    assert 'stats' in response.json
    assert response.json['metadata']['alert_count'] == len(MOCK_ALERTS_DATA)

# --- Test Role-Based Access Control (RBAC) ---
def test_admin_users_forbidden_for_viewer(client):
    """Test that /api/v1/admin/users is forbidden for a viewer role."""
    login_data = {'username': 'viewer', 'password': 'testpassword'}
    client.post('/api/v1/auth/login', json=login_data)

    response = client.get('/api/v1/admin/users')
    assert response.status_code == 403
    assert response.json == {'error': 'Forbidden', 'message': 'You do not have the necessary permissions to access this resource.'}

def test_admin_users_allowed_for_admin(client):
    """Test that /api/v1/admin/users is allowed for an admin role."""
    login_data = {'username': 'testuser', 'password': 'testpassword'} # testuser is admin
    client.post('/api/v1/auth/login', json=login_data)

    response = client.get('/api/v1/admin/users')
    assert response.status_code == 200
    assert isinstance(response.json, list) # Expecting a list of users

def test_performance_summary_forbidden_for_viewer(client):
    """Test that /api/v1/performance/summary is forbidden for a viewer role."""
    login_data = {'username': 'viewer', 'password': 'testpassword'}
    client.post('/api/v1/auth/login', json=login_data)

    response = client.get('/api/v1/performance/summary')
    assert response.status_code == 403
    assert response.json == {'error': 'Forbidden', 'message': 'You do not have the necessary permissions to access this resource.'}

def test_performance_summary_allowed_for_analyst(client):
    """Test that /api/v1/performance/summary is allowed for an analyst role."""
    login_data = {'username': 'analyst', 'password': 'testpassword'}
    client.post('/api/v1/auth/login', json=login_data)

    response = client.get('/api/v1/performance/summary')
    assert response.status_code == 200
    assert 'cache_hit_rate' in response.json # Expecting performance metrics
