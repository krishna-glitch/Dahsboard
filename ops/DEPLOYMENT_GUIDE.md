# Deployment Guide (EC2 + Nginx + Gunicorn)

This guide consolidates all steps required to deploy the Flask API and React frontend with Nginx proxy caching, Redshift 2h MV, prewarming, and monitoring.

## Overview
- Reverse proxy: Nginx serves the React build, proxies `/api` to Flask, and caches safe API responses.
- App server: Gunicorn binds to `127.0.0.1:5000` and runs the Flask app (`flask.wsgi:app`).
- Backend: Flask app with ETag/Cache-Control middleware for revalidation.
- Data: Redshift; optional materialized view for 2‑hour cadence (std fidelity).
- Caching: Nginx `proxy_cache` + scripts to prewarm and validate.

## Prerequisites
- Ubuntu LTS server (or similar), sudo access.
- Packages: `nginx`, `python3-venv`, `python3-pip`, `git`.
- Redshift connectivity + permissions to create/refresh materialized views.

## Paths and Conventions
- Repo checkout: `/srv/water-quality` (adjust paths if you choose another base).
- React build path: `/var/www/water-quality/dist`.
- Gunicorn binds `127.0.0.1:5000`, Nginx listens on `80` (and TLS if enabled).

## 1) Clone and Backend Setup
```bash
sudo mkdir -p /srv/water-quality
sudo chown -R "$USER":"$USER" /srv/water-quality
cd /srv/water-quality

git clone <your-repo-url> .
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip wheel
pip install -r flask/requirements.txt
pip install gunicorn
```

### Gunicorn config + service
- Config: `ops/gunicorn/gunicorn.conf.py` (gthread workers, timeouts tuned for analytics).
- WSGI entry: `flask/wsgi.py` (exports `app`).
- Systemd service (edit paths if needed):
```bash
sudo cp ops/systemd/water-quality-api.service /etc/systemd/system/
# If you used a different base dir, edit WorkingDirectory/ExecStart accordingly
sudo systemctl daemon-reload
sudo systemctl enable --now water-quality-api
sudo systemctl status water-quality-api
```

## 2) Frontend Build
- Build locally or in CI:
```bash
cd react/frontend
npm ci
npm run build
```
- Deploy build to server:
```bash
sudo mkdir -p /var/www/water-quality/dist
sudo rsync -av react/frontend/dist/ /var/www/water-quality/dist/
```

## 3) Nginx Setup (Phased)
- Server block: `ops/nginx/server.conf` (serves static + proxies `/api`).
```bash
sudo cp ops/nginx/server.conf /etc/nginx/sites-available/water-quality
# Edit `root` to /var/www/water-quality/dist and confirm upstream 127.0.0.1:5000
sudo ln -sf /etc/nginx/sites-available/water-quality /etc/nginx/sites-enabled/water-quality
sudo rm -f /etc/nginx/sites-enabled/default || true
sudo nginx -t && sudo systemctl reload nginx
```
- Phase 1: Cache disabled (include is commented). Verify routing works.
- Phase 2: Enable API cache
```bash
sudo mkdir -p /etc/nginx/snippets
sudo cp ops/nginx/api-cache.conf /etc/nginx/snippets/api-cache.conf
# Edit /etc/nginx/sites-available/water-quality and UNCOMMENT the include line under `location /api/`
sudo nginx -t && sudo systemctl reload nginx
```

### Optional: JSON access logging with cache status
```bash
sudo cp ops/nginx/logging.conf /etc/nginx/conf.d/logging.conf
sudo nginx -t && sudo systemctl reload nginx
```
- Summarize last 24h: `python3 scripts/nginx_cache_report.py /var/log/nginx/wq_access.json --since 24h`

### Optional: TLS
- Use certbot or your preferred method; point to the same `server` block.

## 4) Redshift 2‑hour MV (std fidelity)
- Create MV for 2h cadence: `sql/redshift/mv_processed_eh_2h.sql`.
```sql
DROP MATERIALIZED VIEW IF EXISTS impact.mv_processed_eh_2h;
CREATE MATERIALIZED VIEW impact.mv_processed_eh_2h AS
SELECT
  mv.site_id,
  dateadd(
    hour,
    2 * (datediff(hour, timestamp '1970-01-01 00:00:00', mv.measurement_timestamp) / 2),
    timestamp '1970-01-01 00:00:00'
  ) AS bucket_ts,
  mv.depth_cm,
  AVG(mv.processed_eh) AS processed_eh
FROM impact.mv_processed_eh mv
GROUP BY 1, 2, 3;
```
- Schedule: `REFRESH MATERIALIZED VIEW impact.mv_processed_eh_2h;` after ETL (hourly/daily).
- Note: Redshift may warn about full recompute on refresh; acceptable operationally. If needed, replace with a rollup table + ETL upsert.

## 5) Cache Prewarm (both fidelities)
- One‑off warm (monthly windows):
```bash
BASE_URL=http://<host> SITES=S1,S2,S3,S4 START_YM=2023-01 END_YM=2023-12 ./scripts/prewarm_both.sh
```
- Validate:
```bash
python3 scripts/cache_validation.py --base http://<host> --sites S1,S2 \
  --start 2023-01 --end 2023-03 --resolution 2h --fidelity std
python3 scripts/cache_validation.py --base http://<host> --sites S1,S2 \
  --start 2023-01 --end 2023-03 --resolution raw --fidelity max
```

### Schedule prewarm daily (systemd)
```bash
sudo cp ops/systemd/wq-cache-warm.service /etc/systemd/system/
sudo cp ops/systemd/wq-cache-warm.timer /etc/systemd/system/
# Edit BASE_URL/SITES/START_YM/END_YM in the service or add a drop-in override
sudo systemctl daemon-reload
sudo systemctl enable --now wq-cache-warm.timer
sudo systemctl list-timers | grep wq-cache-warm
```

## 6) Dev Hosting with Nginx (optional)
- Proxy Vite (5173) + Flask (5000) with Nginx on port 8080: `ops/nginx/dev-server.conf`.
```bash
sudo cp ops/nginx/dev-server.conf /etc/nginx/sites-available/wq-dev
sudo ln -sf /etc/nginx/sites-available/wq-dev /etc/nginx/sites-enabled/wq-dev
sudo nginx -t && sudo systemctl reload nginx
# Visit http://localhost:8080 (HMR works; /api proxied)
```

## 7) Operations & Monitoring
- Inspect cache HIT/MISS:
```bash
python3 scripts/nginx_cache_report.py /var/log/nginx/wq_access.json --since 24h
```
- Tail logs: `sudo tail -f /var/log/nginx/wq_access.json` (json lines).
- Gunicorn logs: `journalctl -u water-quality-api -e -f`.

## 8) Troubleshooting
- `nginx -t` errors: verify server root path and upstream.
- 502/504 on large queries: increase Nginx proxy timeouts (see `server.conf`), confirm Gunicorn `timeout=300`.
- Cache not hitting: ensure `ops/nginx/api-cache.conf` is included, and that the endpoint path matches the `location` regex. Check `X-Proxy-Cache` header.
- Redshift MV missing: API falls back to ad‑hoc 2h GROUP BY. Create/refresh the MV when possible.
- CORS: Flask CORS allows dev ports (5173+); adjust if frontend origin differs.

## 9) Security Notes
- No secrets committed; configure via environment variables and centralized config.
- Cookies: `HttpOnly` and `SameSite` tuned based on HTTPS; enable TLS in production.
- CSP and security headers applied in `flask/app.py`.

## 10) Rollback
- Disable cache: comment the `include /etc/nginx/snippets/api-cache.conf;`, reload Nginx.
- Disable prewarm: `sudo systemctl disable --now wq-cache-warm.timer`.
- Revert Gunicorn changes: `sudo systemctl stop water-quality-api` and start prior app server.

## 11) Vercel + EC2 Split (optional)
- Host React on Vercel; keep Flask API behind Nginx on EC2.
- Configure frontend API base URL (`VITE_API_BASE_URL`) to point to the EC2 API origin.

---
With this in place, you can defer deployment until development is complete, then follow this guide end‑to‑end.

