# DayNest 部署手册

## 0. 资源准备

- 一台域内 VPS（阿里云 / 腾讯云 / 雨云等），推荐 1C2G 起步，30 GB 系统盘
- 一个绑定到该 VPS 的域名（例如 `daynest.example.com`）
- 七牛 Kodo：
  - 一个**私有空间**用于照片，绑定 HTTPS 域名（强烈建议）
  - 一个空间用于数据库备份（可以与照片同一个，但目录前缀分开）

## 1. 系统准备

```bash
sudo apt update && sudo apt install -y \
  nginx sqlite3 jq curl git unzip rsync \
  certbot python3-certbot-nginx

# Node 20 + pnpm
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pnpm@9 pm2

# 创建专用用户
sudo useradd -m -s /bin/bash daynest
sudo mkdir -p /var/www/daynest/{api,web} /var/lib/daynest /var/log/daynest /srv/daynest
sudo chown -R daynest:daynest /srv/daynest /var/lib/daynest /var/log/daynest /var/www/daynest
```

## 2. 拉代码

```bash
sudo -u daynest git clone <your-repo-url> /srv/daynest
```

## 3. 配置环境变量

```bash
sudo cp /srv/daynest/deploy/env.example /etc/daynest/.env
sudo chown root:daynest /etc/daynest/.env
sudo chmod 640 /etc/daynest/.env

# 生成两个独立的 JWT 密钥
echo "JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')" | sudo tee -a /etc/daynest/.env
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 48 | tr -d '\n')" | sudo tee -a /etc/daynest/.env

sudo $EDITOR /etc/daynest/.env
# 填入：
#   QINIU_ACCESS_KEY / QINIU_SECRET_KEY / QINIU_BUCKET / QINIU_DOMAIN / QINIU_ZONE
#   CORS_ORIGIN=https://daynest.example.com
#   BACKUP_QINIU_BUCKET / BACKUP_QINIU_KEY_PREFIX
```

## 4. Nginx & SSL

```bash
# 临时配置只放 HTTP 那一段（注释掉 HTTPS server 块），让 certbot 可以申请证书
sudo cp /srv/daynest/deploy/nginx/daynest.conf /etc/nginx/sites-available/
sudo ln -s ../sites-available/daynest.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 申请证书
sudo certbot --nginx -d daynest.example.com

# certbot 会自动改 nginx 配置；再次确认证书路径与 daynest.conf 中一致
sudo nginx -t && sudo systemctl reload nginx
```

## 5. 首次部署

```bash
sudo bash /srv/daynest/deploy/scripts/deploy.sh
```

该脚本会：

1. `pnpm install --frozen-lockfile`
2. 依次构建 `@daynest/shared` / `@daynest/api` / `@daynest/web`
3. `prisma migrate deploy`（首次会创建 `/var/lib/daynest/daynest.db`）
4. `rsync` 产物到 `/var/www/daynest/`
5. `pm2 start ecosystem.config.cjs && pm2 save`
6. `systemctl reload nginx`

## 6. 创建首个家庭成员

```bash
cd /srv/daynest
sudo -u daynest -E SEED_USERNAME=mom \
  SEED_PASSWORD="$(openssl rand -base64 12)" \
  pnpm --filter @daynest/api seed
```

会打印登陆密码 + 一个邀请口令。打开 `https://daynest.example.com/` 登录即可。
邀请家人：登录后到“设置 → 邀请家人 → 生成邀请”，把链接发给他们。

## 7. 备份

```bash
# 测试一次
sudo -u daynest -E bash /srv/daynest/deploy/scripts/backup-sqlite.sh

# 加入 crontab
sudo -u daynest crontab /srv/daynest/deploy/crontab.example
```

## 8. 日常运维

| 操作 | 命令 |
| --- | --- |
| 拉新版重新部署 | `sudo bash /srv/daynest/deploy/scripts/deploy.sh` |
| 跳过 git pull 的部署 | `sudo bash /srv/daynest/deploy/scripts/deploy.sh --no-pull` |
| 查看 API 日志 | `sudo -u daynest pm2 logs daynest-api --lines 200` 或 `tail -f /var/log/daynest/api.out.log` |
| 重启 API | `sudo -u daynest pm2 restart daynest-api` |
| 备份 DB | `bash /srv/daynest/deploy/scripts/backup-sqlite.sh` |
| 恢复 DB | `bash /srv/daynest/deploy/scripts/restore-sqlite.sh daynest-YYYYMMDD-HHMMSS.db.gz` |
| 重新生成邀请口令 | 在网站设置页生成（或调 `POST /api/invites`） |
| 旋转 JWT 密钥 | 改 `/etc/daynest/.env` → 重启 → 所有 session 失效，需重新登录 |

## 9. 灾备恢复（VPS 报废）

1. 在新机器按 §1–§4 重建系统
2. 用 `qshell` / 七牛控制台下载最新的备份 `*.db.gz` 到 `/var/lib/daynest/backups/`
3. `bash /srv/daynest/deploy/scripts/restore-sqlite.sh <文件名>`
4. 把同样的 `QINIU_*` 配置写入 `/etc/daynest/.env`（照片本身在七牛，不需要迁移）
5. `bash deploy/scripts/deploy.sh`

照片完整性：所有 `fileKey` 都是七牛对象 key，DB 恢复 + 七牛 bucket 完好 = 完整恢复。

## 10. 安全清单

- [x] HTTPS 强制，HSTS 一年
- [x] argon2id 密码
- [x] HttpOnly + Secure + SameSite=Lax refresh cookie
- [x] 七牛 bucket 设为私有，所有访问走签名 URL
- [x] CORS 限制到自有域名
- [x] JWT 短 TTL（15 分钟）+ refresh 自动续期
- [ ] 防火墙开放 80 / 443 / SSH，关闭其他
- [ ] 给 SSH 启用 key-only + 修改默认端口（运维事项）
- [ ] 启用 fail2ban（运维事项）
