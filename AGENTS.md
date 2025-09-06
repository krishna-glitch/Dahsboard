# Repository Guidelines

This guide helps contributors work efficiently and consistently across the Flask backend and React frontend.

## Project Structure & Module Organization
- Backend: `flask/` with blueprints in `flask/api/`, services in `flask/services/`, utilities in `flask/utils/`, config in `flask/config/`. App factory: `flask/app.py`.
- Frontend: `react/frontend/` (Vite). Source in `src/`, static in `public/`, build output in `dist/`.
- Tests: Python tests in `flask/tests/` (and `flask/test_*.py`); frontend tests co‑located with code via Vitest.
- Scripts: `restart_flask.sh` for local backend restarts.

## Build, Test, and Development Commands
- Backend env: `python -m venv flask/venv && source flask/venv/bin/activate`.
- Run API: `cd flask && python app.py` (serves API, CORS allows `http://localhost:5173`).
- Backend tests: from repo root, `PYTHONPATH=$(pwd) pytest -q flask/tests`.
- Frontend setup: `cd react/frontend && npm install`.
- Dev server: `npm run dev` (http://localhost:5173). Build: `npm run build` (outputs to `react/frontend/dist/`).
- Frontend tests: `npm test`; coverage: `npm run test:coverage`.

## Coding Style & Naming Conventions
- Python: 4‑space indents, PEP 8. Blueprints named `*_bp`; routes under `/api/v1/...`. Modules use `snake_case`; classes `CapWords`.
- JavaScript/React: ESLint configured in `react/frontend/eslint.config.js`. Use `camelCase` for variables/functions and `PascalCase` for components (e.g., `PageLayout.jsx`). Place components in `src/components/` and layouts in `src/layouts/`.

## Testing Guidelines
- Backend: Pytest with fixtures/mocks. Name files `test_*.py` (e.g., `flask/tests/test_api.py`). Run with `PYTHONPATH=$(pwd)` to resolve `migration.flask.*` imports.
- Frontend: Vitest + Testing Library. Co‑locate `*.test.jsx` with components; keep tests deterministic and mock network (e.g., Axios).

## Commit & Pull Request Guidelines
- Commits: concise, imperative (e.g., "add auth guard to performance routes"); group related changes; avoid unrelated refactors.
- PRs: include clear summary, linked issues, test plan/outputs, and screenshots/GIFs for UI changes. Ensure `pytest` and `npm test` pass. Note any config or migration steps.

## Security & Configuration Tips
- Do not commit secrets. Server settings come from `config.get_server_config()`; use environment variables in development.
- CORS: backend allows Vite dev origin (`5173`); update only if necessary.
- Serving UI: Flask serves built React from `react/frontend/dist/`; during local dev, run frontend and backend separately.

