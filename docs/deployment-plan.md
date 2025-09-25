# Deployment + CI/CD Plan

This document captures the deployment approach and automation steps we agreed on so we can revisit or extend the work next week.

## Goals
- Keep costs near zero (single EC2 instance, S3 for uploads, optional Redis)
- Easy for one developer to manage
- Predictable deployments (no manual pip/npm installs on servers)
- CI pipeline that lint/tests on every push and deploys automatically on `main`

We use Docker for consistent environments, docker-compose for local/prod orchestration, and GitHub Actions for CI/CD. SQLite remains the auth store (cheap and simple), Redis is optional, S3 handles file uploads.

---

## 1. Containerised Stack

Files to add at repo root:

```
Dockerfile.api        # Flask API + Gunicorn
Dockerfile.frontend   # Build Vite bundle, serve via nginx
docker-compose.yml    # api + frontend + optional redis
nginx/frontend.conf   # nginx reverse proxy config
data/                 # persistent SQLite DB/uploads (host volume)
.env                  # env vars (not committed)
```

### Dockerfile.api

```
FROM python:3.12-slim
WORKDIR /srv/app
RUN apt-get update && apt-get install -y build-essential && rm -rf /var/lib/apt/lists/*
COPY flask/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY flask /srv/app/flask
COPY auth_database.py config services utils /srv/app/
ENV PYTHONPATH=/srv/app
CMD ["gunicorn", "-w", "3", "-b", "0.0.0.0:8000", "flask.app:create_app()"]
```

### Dockerfile.frontend

```
FROM node:20 AS build
WORKDIR /app
COPY react/frontend/package*.json ./
RUN npm ci
COPY react/frontend .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/frontend.conf /etc/nginx/conf.d/default.conf
```

### docker-compose.yml

```
version: "3.9"
services:
  api:
    image: ghcr.io/<org>/<repo>/api:latest   # overwritten by CI deploy
    build:                                   # for local dev
      context: .
      dockerfile: Dockerfile.api
    env_file: .env
    volumes:
      - ./data:/srv/app/data
    expose:
      - "8000"
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

  frontend:
    image: ghcr.io/<org>/<repo>/frontend:latest
    build:
      context: .
      dockerfile: Dockerfile.frontend
    ports:
      - "80:80"
    depends_on:
      - api

volumes:
  redis-data:
```

### nginx/frontend.conf

```
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /api/ {
    proxy_pass http://api:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    client_max_body_size 50M;
  }
}
```

### `.env` example (keep on server, not in git)

```
FLASK_ENV=production
SECRET_KEY=change-me
SQLALCHEMY_DATABASE_URI=sqlite:////srv/app/data/auth.db
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_DEFAULT_REGION=us-east-1
REDIS_URL=redis://redis:6379/0
```

---

## 2. Manual Server Prep (once)

1. Launch Ubuntu EC2 t2.micro (free tier).
2. Install Docker + docker-compose plugin:
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose-plugin
   sudo usermod -aG docker ubuntu
   ```
3. Create deploy user / directories:
   ```bash
   sudo adduser --disabled-password deploy
   sudo usermod -aG docker,www-data deploy
   sudo mkdir -p /srv/app /var/www/dashboard /srv/app/data
   sudo chown -R deploy:www-data /srv/app /var/www/dashboard
   ```
4. Copy repo, `.env`, docker-compose, nginx config to `/srv/app`.
5. Place initial `auth.db` in `/srv/app/data` (or run seed script).
6. Bring up stack:
   ```bash
   cd /srv/app
   docker compose up -d --build
   ```
7. Verify `http://<ec2-ip>` serves the React app, `/api/v1/auth/health` returns JSON.

---

## 3. GitHub Actions CI/CD

Add `.github/workflows/deploy.yml`:

```yaml
name: CI/CD

on:
  push:
    branches: [ main ]
  pull_request:

env:
  REGISTRY: ghcr.io
  IMAGE_PREFIX: ${{ github.repository }}

jobs:
  build-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
        working-directory: react/frontend
      - run: npm run lint
        working-directory: react/frontend
      - run: npm run build
        working-directory: react/frontend
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: |
          python -m pip install --upgrade pip
          pip install -r flask/requirements.txt
      - run: python -m pytest
        working-directory: flask

  deploy:
    needs: build-test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Login to GHCR
        run: |
          echo "${{ secrets.GITHUB_TOKEN }}" | docker login ${{ env.REGISTRY }} -u ${{ github.actor }} --password-stdin
      - name: Build & push API image
        run: |
          docker build -f Dockerfile.api -t ${{ env.REGISTRY }}/${{ env.IMAGE_PREFIX }}/api:${{ github.sha }} .
          docker push ${{ env.REGISTRY }}/${{ env.IMAGE_PREFIX }}/api:${{ github.sha }}
      - name: Build & push Frontend image
        run: |
          docker build -f Dockerfile.frontend -t ${{ env.REGISTRY }}/${{ env.IMAGE_PREFIX }}/frontend:${{ github.sha }} .
          docker push ${{ env.REGISTRY }}/${{ env.IMAGE_PREFIX }}/frontend:${{ github.sha }}
      - name: SSH deploy
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_KEY }}
          script: |
            cd /srv/app
            TAG=${{ github.sha }}
            sed -i "s#:latest#:${TAG}#g" docker-compose.yml
            docker compose pull
            docker compose up -d --remove-orphans
```

Secrets to set in GitHub:
- `DEPLOY_HOST`: EC2 public DNS/IP
- `DEPLOY_USER`: deploy
- `DEPLOY_KEY`: private SSH key (matching deploy user)
  
GitHub token is auto-injected for GHCR pushes.

This pipeline runs lint/tests on every push/PR. On merges to `main`, it builds/pushes Docker images and restarts the compose stack on EC2.

---

## 4. Rollback & Maintenance Notes

- To roll back: run the deploy workflow with an older commit SHA or `docker compose up -d` with previous tags.
- Ensure `/srv/app/data` is backed up periodically (cron `tar` + S3). That holds SQLite `auth.db` and uploads.
- Monitor EC2 disk usage; prune Docker images occasionally: `docker system prune -f`.
- For HTTPS, add Certbot container or terminate TLS at a load balancer; flip `FORCE_HTTPS` to 1 in `.env` when ready.

---

## 5. Open Items / Next Week
- Decide whether to keep Redis on by default or only for year-range caching.
- Confirm `auth.db` seeding process (maybe a Python script in repo).
- Once ready, add a `redeploy.sh` script on EC2 so the CI SSH step just invokes it.
- Eventually replace SQLite with Postgres if multi-user load increases (SQLAlchemy already supports it).
- Fix existing ESLint violations before enforcing lint in CI (see `npm run lint` output).

