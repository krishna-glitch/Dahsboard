# EC2 Deployment (Nginx + Gunicorn)

Phased, safe setup to run the Flask API behind Nginx and serve the React build.

## 0) Prep server
- Ubuntu LTS recommended. SSH in with sudo-capable user.
- Install packages:
  - `sudo apt-get update`
  - `sudo apt-get install -y nginx python3-venv python3-pip git`

## 1) Clone repo and set up Python env
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

## 2) Build frontend on CI or locally and upload
- Build: `cd react/frontend && npm ci && npm run build`
- Copy `react/frontend/dist/` to server: `/var/www/water-quality/dist`
  - `sudo mkdir -p /var/www/water-quality/dist`
  - `sudo rsync -av react/frontend/dist/ /var/www/water-quality/dist/`

## 3) Configure Gunicorn (app server)
- Config lives at `ops/gunicorn/gunicorn.conf.py`.
- Quick test (foreground): `./ops/run_gunicorn.sh`
- Systemd service (as root):
```bash
sudo cp ops/systemd/water-quality-api.service /etc/systemd/system/
# Adjust paths in the unit if you used a different base dir
sudo systemctl daemon-reload
sudo systemctl enable --now water-quality-api
sudo systemctl status water-quality-api
```

## 4) Configure Nginx
- Copy server config and set root path:
```bash
sudo cp ops/nginx/server.conf /etc/nginx/sites-available/water-quality
# Edit root path to /var/www/water-quality/dist if needed
sudo ln -sf /etc/nginx/sites-available/water-quality /etc/nginx/sites-enabled/water-quality
sudo rm -f /etc/nginx/sites-enabled/default || true
```
- Phase 1: keep API cache disabled (include is commented).
- Test & reload:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 5) Enable API proxy cache (Phase 2)
```bash
sudo mkdir -p /etc/nginx/snippets
sudo cp ops/nginx/api-cache.conf /etc/nginx/snippets/api-cache.conf
# Edit /etc/nginx/sites-available/water-quality and UNCOMMENT the include line under location /api/
sudo nginx -t && sudo systemctl reload nginx
```
- Validate:
```bash
python3 scripts/cache_validation.py --base http://<host> --sites S1,S2 \
  --start 2023-01 --end 2023-03 --resolution 2h --fidelity std --max-depths any
```
- Optional prewarm: `BASE_URL=http://<host> ./scripts/warm_api_cache.sh`

## 6) Redshift 2h MV and refresh
- Create 2h MV (see `sql/redshift/mv_processed_eh_2h.sql`). Example:
```
-- drop if exists (safe)
DROP MATERIALIZED VIEW IF EXISTS impact.mv_processed_eh_2h;

-- create
CREATE MATERIALIZED VIEW impact.mv_processed_eh_2h AS
SELECT
  mv.site_id,
  dateadd(hour,
          2 * (datediff(hour, timestamp '1970-01-01 00:00:00', mv.measurement_timestamp) / 2),
          timestamp '1970-01-01 00:00:00') AS bucket_ts,
  mv.depth_cm,
  AVG(mv.processed_eh) AS processed_eh
FROM impact.mv_processed_eh mv
GROUP BY 1, 2, 3;
```
- Schedule refresh (hourly/daily) after your ETL completes:
  - `REFRESH MATERIALIZED VIEW impact.mv_processed_eh_2h;`
- Note: If Redshift warns it will fully recompute on refresh, that’s acceptable. If refresh time grows too large, switch to a rollup table and incremental upsert.

## 7) Prewarm both fidelities
- Emit both 2h (std) and raw (max) URLs per site/month and warm via curl:
```
python scripts/generate_redox_prewarm_urls.py \
  --base http://<host> \
  --sites S1,S2,S3,S4 \
  --start 2023-01 --end 2023-12 \
  --both \
  | xargs -n1 -P4 -I{} curl -s -m 120 -H 'Accept: application/json' -o /dev/null '{}'
```
- Validate: `python scripts/cache_validation.py --base http://<host> --sites S1,S2 --start 2023-01 --end 2023-03 --resolution 2h --fidelity std` and then with `--resolution raw --fidelity max`.

## 8) Schedule automatic prewarm (systemd)
- Copy service/timer:
```
sudo cp ops/systemd/wq-cache-warm.service /etc/systemd/system/
sudo cp ops/systemd/wq-cache-warm.timer /etc/systemd/system/
```
- Edit BASE_URL/SITES/START_YM/END_YM in the service or add a drop-in at `/etc/systemd/system/wq-cache-warm.service.d/override.conf`.
- Enable timer:
```
sudo systemctl daemon-reload
sudo systemctl enable --now wq-cache-warm.timer
sudo systemctl list-timers | grep wq-cache-warm
```

## 9) Nginx cache telemetry
- Include `ops/nginx/logging.conf` as `/etc/nginx/conf.d/logging.conf` and reload Nginx.
- Summarize last 24h HIT/MISS: `python3 scripts/nginx_cache_report.py /var/log/nginx/wq_access.json --since 24h`.

## 6) TLS (optional)
- Use certbot or your preferred method; point to this server block.

## Notes
- Gunicorn binds `127.0.0.1:5000` (see config). Nginx proxies to it.
- ETag/Cache-Control middleware is active for safe JSON APIs, enabling `proxy_cache_revalidate`.
- Tune worker counts in `ops/gunicorn/gunicorn.conf.py` to fit CPU/memory.
