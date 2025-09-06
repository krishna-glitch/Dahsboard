from flask import jsonify

class APIError(Exception):
    """Custom exception for API errors."""
    def __init__(self, message, status_code=500, payload=None):
        super().__init__()
        self.message = message
        self.status_code = status_code
        self.payload = payload

    def to_dict(self):
        rv = dict(self.payload or ())
        rv['message'] = self.message
        rv['error'] = True # Indicate that this is an error response
        return rv
