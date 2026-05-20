# DayNest · 日常巢

家庭日常记录站。私有访问，剪贴簿风格，照片存七牛 Kodo，数据存 SQLite，部署在一台轻量级 VPS 上。

## 仓库结构

```
day_nest/
├── apps/
│   ├── api/                  Fastify + Prisma + SQLite 后端
│   └── web/                  Vite + React + Tailwind 前端
├── packages/
│   └── shared/               前后端共享的 zod DTO
├── deploy/                   生产环境的 Nginx / pm2 / 备份脚本
└── docs/superpowers/
    ├── specs/                设计规约
    └── plans/                实施计划（按 backend / frontend / deploy 分册）
```

## 本地开发

需要 Node 20+ 和 pnpm 9+。

```bash
pnpm install
pnpm --filter @daynest/shared build
cd apps/api
DATABASE_URL='file:./dev.db' pnpm exec prisma migrate deploy
SEED_USERNAME=mom SEED_PASSWORD=test-12345 pnpm seed   # 创建首个用户 + 邀请码

# 后端
DATABASE_URL='file:./dev.db' \
JWT_SECRET=$(openssl rand -base64 48) \
JWT_REFRESH_SECRET=$(openssl rand -base64 48) \
QINIU_ACCESS_KEY=... QINIU_SECRET_KEY=... \
QINIU_BUCKET=... QINIU_DOMAIN=https://cdn.example.com \
pnpm dev

# 前端（另一个终端）
cd apps/web && pnpm dev
# 打开 http://localhost:5173
```

Vite dev server 已经配好 `/api` 反代到 `127.0.0.1:3000`。

### 跑测试

```bash
pnpm --filter @daynest/api test
```

后端覆盖：认证、邀请、上传 token、Collections / Photos / Tags 全量增删改查。

## 生产部署

详细操作手册在 [`docs/deploy.md`](./docs/deploy.md)，对应的配置在 `deploy/`。

简化版：

```bash
# VPS 上首次部署
sudo apt install -y nginx sqlite3 jq curl
sudo npm i -g pnpm pm2

git clone <repo> /srv/daynest
cd /srv/daynest
sudo cp deploy/env.example /etc/daynest/.env && sudo chmod 600 /etc/daynest/.env
sudo $EDITOR /etc/daynest/.env               # 填入真实密钥
sudo cp deploy/nginx/daynest.conf /etc/nginx/sites-available/
sudo ln -s ../sites-available/daynest.conf /etc/nginx/sites-enabled/
sudo certbot --nginx -d daynest.example.com  # SSL
sudo bash deploy/scripts/deploy.sh           # build + 启动
```

之后每次更新只需要 `bash deploy/scripts/deploy.sh`。

## 备份与恢复

每天凌晨 3:30 自动 `sqlite3 .backup` + gzip + 上传七牛备份桶（见 `deploy/crontab.example`）。

```bash
# 列出近期本地快照
bash deploy/scripts/restore-sqlite.sh

# 用某个快照恢复
bash deploy/scripts/restore-sqlite.sh daynest-20260520-033000.db.gz
```

## 设计与决策

- **设计规约**：`docs/superpowers/specs/2026-05-20-day-nest-design.md`
- **实施计划**：
  - 后端 `docs/superpowers/plans/2026-05-20-daynest-backend.md`
  - 前端 `docs/superpowers/plans/2026-05-20-daynest-frontend.md`
  - 部署 `docs/superpowers/plans/2026-05-20-daynest-deployment.md`

## 许可证

私有，仅限家庭成员访问。
