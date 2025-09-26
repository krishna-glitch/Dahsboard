# Repository Guidelines

## Project Structure & Module Organization
- Backend lives in `flask/`; blueprints under `flask/api/`, services in `flask/services/`, utilities in `flask/utils/`, and configuration in `flask/config/`. The app factory is defined in `flask/app.py`.
- Frontend resides in `react/frontend/` (Vite). Source files stay in `src/`, static assets in `public/`, and build artifacts emit to `dist/`.
- Python tests sit in `flask/tests/` (plus any `flask/test_*.py`). Frontend Vitest specs stay beside the components they validate.

## Build, Test, and Development Commands
- `cd flask && python app.py`: start the Flask API locally; CORS defaults to `http://localhost:5173`, override with `FLASK_ALLOWED_ORIGINS` when needed.
- `PYTHONPATH=$(pwd) pytest -q flask/tests`: run the backend test suite from the repo root.
- `alembic -c flask/alembic.ini upgrade head`: apply database migrations (respects `AUTH_DATABASE_URL`).
- `cd react/frontend && npm install`: install frontend dependencies.
- `npm run dev`: launch the Vite dev server at `5173`.
- `npm run build`: produce the production bundle in `react/frontend/dist/`.
- `npm test`, `npm run test:coverage`, or `npm run security:audit`: execute Vitest suites, coverage, or npm audit respectively.

## Coding Style & Naming Conventions
- Python follows PEP 8 with 4-space indentation; blueprints use the `*_bp` pattern and routes live under `/api/v1/...`.
- JavaScript/React relies on the repo ESLint config; prefer `camelCase` for functions/vars and `PascalCase` for components (e.g., `PageLayout.jsx`). Place shared components in `src/components/` and layouts in `src/layouts/`.

## Testing Guidelines
- Backend: write pytest cases using fixtures/mocks; name files `test_*.py`. Run via the provided `PYTHONPATH` command and add `bandit -r flask` for security linting before release.
- Frontend: use Vitest + Testing Library. Co-locate `*.test.jsx` with source, mock network traffic (e.g., Axios), and run `npm run security:audit` for dependency scanning.

## Commit & Pull Request Guidelines
- Use imperative, focused commit messages (e.g., `add auth guard to performance routes`). Group related changes and avoid drive-by refactors.
- PRs should include a concise summary, linked issues, and evidence that `pytest` and `npm test` pass. Attach screenshots or GIFs for UI updates and mention any setup or migration steps.

## Security & Configuration Tips
- Never commit secrets. Server settings come from `config.get_server_config()` and should be driven by environment variables locally (`FLASK_ALLOWED_ORIGINS`, `SESSION_COOKIE_SAMESITE`, `STRICT_TRANSPORT_SECURITY`, `AUTH_DATABASE_URL`, etc.).
- CSRF is enforced globally—`services/api.js` automatically fetches `GET /api/v1/auth/csrf-token` and attaches the `X-CSRF-Token` header for mutating requests.
- Maintain CORS defaults unless requirements change, and serve the built React app from `react/frontend/dist/` in production. Update `FLASK_ALLOWED_ORIGINS` when deploying to new hosts.
- Use `restart_flask.sh` to restart the backend during development instead of manual process management.
- Optional proxy cache purging is controlled via `CACHE_PURGE_BASE_URL`; set it to the origin (e.g., `http://127.0.0.1:8080`) to enable automatic PURGE calls after uploads.

## Open Follow-Ups
- Finish triaging the targeted `bandit -r flask/api flask/services flask/utils -x flask/venv,flask/migrations` scan (current blockers: remaining medium/low findings).
