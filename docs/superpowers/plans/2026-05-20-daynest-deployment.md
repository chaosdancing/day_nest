# DayNest Deployment Plan

> **Audience:** Operator who owns a domestic VPS (Aliyun / Tencent / etc.) with root SSH access. We do not assume any prior Docker / nginx tooling; all commands are explicit.

**Goal:** Produce repeatable infrastructure-as-config: Nginx reverse proxy, pm2 process manager, SSL via Let's Encrypt, daily SQLite backup to Qiniu, and a README that explains the whole production lifecycle.

**Files produced live in `deploy/` at the repo root.**

```
deploy/
├── nginx/daynest.conf            # site config, HTTPS, /api -> 3000, /-> static
├── pm2/ecosystem.config.cjs      # pm2 process definition
├── scripts/
│   ├── deploy.sh                 # build + restart pm2 + reload nginx
│   ├── backup-sqlite.sh          # snapshot + upload to qiniu
│   └── restore-sqlite.sh         # download + apply
├── crontab.example
├── env.example                   # template for /etc/daynest/.env
└── systemd/
    └── daynest-api.service       # alternative to pm2
README.deploy.md                  # full operational guide
```

---

## Task 1: Production env template

- [ ] **Step 1: Create `deploy/env.example`** documenting every required variable with safe defaults
- [ ] **Step 2: Verify it matches `apps/api/src/config.ts` exactly**

---

## Task 2: Nginx site config

- [ ] **Step 1: Create `deploy/nginx/daynest.conf`** — HTTP 80 → 301 HTTPS; HTTPS 443:
  - `/api/*` → `proxy_pass http://127.0.0.1:3000`
  - `/healthz` → `proxy_pass http://127.0.0.1:3000/healthz`
  - `/` → `root /var/www/daynest/web; try_files $uri $uri/ /index.html;` (SPA fallback)
  - Headers: `X-Forwarded-For`, `X-Forwarded-Proto`, `Host`
  - gzip + brotli on for HTML/JS/CSS
  - `client_max_body_size 50M` (uploads bypass nginx via direct-to-Qiniu, but still useful)

- [ ] **Step 2: Add HSTS, X-Content-Type-Options, Referrer-Policy headers**

---

## Task 3: pm2 ecosystem

- [ ] Create `deploy/pm2/ecosystem.config.cjs`:
  - app `daynest-api`, script `node dist/src/index.js`, cwd `/var/www/daynest/api`
  - watches off, exec_mode fork, max_memory_restart 400M
  - env loaded from `/etc/daynest/.env` via `--env-file` flag

---

## Task 4: deploy.sh

- [ ] Idempotent script:
  1. `git pull` in `/srv/daynest`
  2. `pnpm install --prod=false`
  3. `pnpm --filter @daynest/shared build`
  4. `pnpm --filter @daynest/api build`
  5. `pnpm --filter @daynest/web build`
  6. `prisma migrate deploy` against prod DB
  7. `rsync` web dist → `/var/www/daynest/web`
  8. `rsync` api dist + prisma + package.json + node_modules → `/var/www/daynest/api`
  9. `pm2 reload daynest-api` (or start if first time)
  10. `nginx -t && systemctl reload nginx`

---

## Task 5: backup-sqlite.sh

- [ ] Use `sqlite3 daynest.db ".backup '/tmp/daynest-YYYYMMDD.db'"` for atomic snapshot
- [ ] gzip
- [ ] Upload to Qiniu using a thin curl-based uploader (auth via Qiniu UpToken from a tiny Node helper, OR use the official qiniu CLI / qshell binary)
- [ ] Retention: keep last 30 daily snapshots locally, push every day to Qiniu (Qiniu rule keeps forever or per bucket lifecycle policy)
- [ ] Exit non-zero on failure so cron mail can notify

---

## Task 6: restore-sqlite.sh

- [ ] Accepts a snapshot filename (or `latest`)
- [ ] Downloads from Qiniu
- [ ] Stops pm2, swaps DB file, starts pm2
- [ ] Prints sanity diff (row counts)

---

## Task 7: crontab.example

- [ ] Daily 03:30 → `backup-sqlite.sh`
- [ ] Weekly `prune` of old local snapshots

---

## Task 8: systemd alternative

- [ ] `daynest-api.service` for ops who don't want pm2
- [ ] Type=simple, ExecStart=node dist/src/index.js, EnvironmentFile=/etc/daynest/.env, Restart=always, User=daynest

---

## Task 9: README.deploy.md

- [ ] One-time bootstrap (apt install, user, dirs, certbot, Qiniu CLI install)
- [ ] First deploy walkthrough
- [ ] Day-2 operations: rotate JWT secret, change Qiniu credentials, add a new family member (`pnpm seed` + invite link), restore from backup
- [ ] Disaster recovery: VPS dead, where's the data, how to bring up on a new box

---

## Task 10: Verify everything

- [ ] Run `bash deploy/scripts/deploy.sh --dry-run` locally to ensure scripts at least parse
- [ ] `nginx -t` against the config in a Docker check or on the dev box if available
- [ ] Commit
