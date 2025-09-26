from flask import Blueprint, request, jsonify
import os
import json
from datetime import datetime

from app_extensions import csrf

debug_bp = Blueprint('debug_bp', __name__)
csrf.exempt(debug_bp)

LOG_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
LOG_PATH = os.path.join(LOG_DIR, 'client_debug.log')

def _append_log(entry: dict):
    try:
        os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
        with open(LOG_PATH, 'a', encoding='utf-8') as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        return True
    except Exception:
        return False

@debug_bp.route('/log', methods=['POST'])
def client_log():
    try:
        payload = request.get_json(silent=True) or {}
        entry = {
            'ts': datetime.utcnow().isoformat() + 'Z',
            'ip': request.remote_addr,
            'ua': request.headers.get('User-Agent'),
            **payload,
        }
        ok = _append_log(entry)
        return jsonify({'ok': ok}), 200
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500
