"""
Settings Configuration for Flask Migration
"""

# Site configuration
SITES = {
    'S1': {'name': 'Site 1', 'location': 'Location 1'},
    'S2': {'name': 'Site 2', 'location': 'Location 2'},
    'S3': {'name': 'Site 3', 'location': 'Location 3'}
}

# Water quality parameters
WATER_QUALITY_PARAMS = {
    'water_level_m': {'name': 'Water Level', 'unit': 'm'},
    'temperature_c': {'name': 'Temperature', 'unit': '°C'},
    'conductivity_us_cm': {'name': 'Conductivity', 'unit': 'μS/cm'},
    'dissolved_oxygen_mg_l': {'name': 'Dissolved Oxygen', 'unit': 'mg/L'}
}

# Time ranges
TIME_RANGES = {
    'Last 7 Days': 7,
    'Last 30 Days': 30,
    'Last 90 Days': 90,
    'Last Year': 365
}
