# DayNest 腾讯轻量服务器安装与账号初始化

本文按当前服务器目录约定编写：

```text
代码目录：/var/www/day_nest
数据库：  /var/lib/daynest/daynest.db
配置：    /etc/daynest/.env
API：     127.0.0.1:3000
Web：     Nginx 静态托管 apps/web/dist
```

适用配置：

```text
CPU: 2 核
内存: 2 GB
系统盘: SSD 云硬盘 40 GB
流量包: 200 GB/月，带宽 3 Mbps
系统: Ubuntu 22.04 / Debian 12
```

图片直传和缩略图走七牛，服务器只跑 Node API、SQLite 和 Nginx，因此 2C2G 足够家庭使用。

## 1. 登录服务器

```bash
ssh root@你的服务器公网IP
```

更新系统并安装基础软件：

```bash
apt update && apt upgrade -y
apt install -y curl git unzip vim ufw nginx sqlite3 openssl ca-certificates
```

## 2. 安装 Node.js、pnpm、PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

corepack enable
corepack prepare pnpm@9.15.3 --activate
npm install -g pm2

node -v
pnpm -v
pm2 -v
```

## 3. 开放端口

腾讯云控制台安全组放行：

```text
22   SSH
80   HTTP
443  HTTPS
```

服务器内防火墙：

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

不要开放 `3000`，API 只由 Nginx 反向代理。

## 4. 准备目录

```bash
mkdir -p /var/www/day_nest
mkdir -p /var/lib/daynest
mkdir -p /etc/daynest
```

## 5. 上传或拉取代码

如果代码在 GitHub：

```bash
cd /var/www
git clone 你的仓库地址 day_nest
cd /var/www/day_nest
```

如果从本地同步：

```bash
rsync -av --exclude node_modules --exclude .git ./ root@服务器IP:/var/www/day_nest/
```

安装依赖：

```bash
cd /var/www/day_nest
pnpm install
```

## 6. 配置环境变量

```bash
cp /var/www/day_nest/deploy/env.example /etc/daynest/.env
vim /etc/daynest/.env
```

建议配置如下：

```ini
NODE_ENV=production
PORT=3000

DATABASE_URL=file:/var/lib/daynest/daynest.db

JWT_SECRET=使用 openssl rand -base64 48 生成
JWT_REFRESH_SECRET=再生成一个不同的

QINIU_ACCESS_KEY=你的七牛AK
QINIU_SECRET_KEY=你的七牛SK
QINIU_BUCKET=你的七牛bucket
QINIU_DOMAIN=http://你的七牛测试域名
QINIU_ZONE=z0

CORS_ORIGIN=http://你的服务器公网IP
```

如果你绑定了域名并开启 HTTPS：

```ini
QINIU_DOMAIN=https://你的七牛CDN域名
CORS_ORIGIN=https://你的域名
```

生成 JWT 密钥：

```bash
openssl rand -base64 48
openssl rand -base64 48
```

把两次输出分别填到 `JWT_SECRET` 和 `JWT_REFRESH_SECRET`。

为了让本地脚本读到配置：

```bash
cp /etc/daynest/.env /var/www/day_nest/apps/api/.env
```

## 7. 初始化数据库和构建

```bash
cd /var/www/day_nest

pnpm -F @daynest/shared build
pnpm -F @daynest/api prisma:generate
pnpm -F @daynest/api prisma:deploy
pnpm build
```

## 8. 创建初始账号

### 方式 A：随机密码

```bash
cd /var/www/day_nest/apps/api
pnpm seed
```

输出中会包含：

```text
[seed] created user "admin"
[seed]   password: 随机密码
[seed] invite token:
[seed]   token: 邀请码
```

登录：

```text
用户名：admin
密码：seed 输出的 password
```

### 方式 B：指定用户名和密码

```bash
cd /var/www/day_nest/apps/api

SEED_USERNAME=mom \
SEED_DISPLAY_NAME=Mom \
SEED_PASSWORD='换成你的强密码' \
pnpm seed
```

登录：

```text
用户名：mom
密码：你设置的 SEED_PASSWORD
```

注意：如果同名用户已存在，`seed` 不会覆盖密码。

## 9. 忘记密码怎么办

当前 `seed` 对已存在用户不会改密码。最简单的处理方式是创建一个新的管理员账号：

```bash
cd /var/www/day_nest/apps/api

SEED_USERNAME=admin2 \
SEED_DISPLAY_NAME=Admin2 \
SEED_PASSWORD='新的强密码' \
pnpm seed
```

然后用 `admin2 / 新的强密码` 登录。

如果必须重置已有账号密码，需要临时写脚本更新数据库中的 `passwordHash`，不要直接改 SQLite 明文密码。

## 10. 新建家庭成员账号

首次 `seed` 会输出 invite token。家人访问：

```text
http://你的服务器公网IP/register?invite=邀请码
```

如果你已经配置域名：

```text
https://你的域名/register?invite=邀请码
```

如果邀请码过期或丢失，可以登录后在网站设置页生成；如果页面还未提供入口，可以调用后端 `POST /api/invites` 生成新的邀请。

## 11. 启动 API

```bash
cd /var/www/day_nest/apps/api
pm2 start "node --env-file=/etc/daynest/.env dist/src/index.js" --name daynest-api
pm2 save
pm2 startup
```

查看状态：

```bash
pm2 status
pm2 logs daynest-api --lines 80
```

## 12. 配置 Nginx

创建配置：

```bash
vim /etc/nginx/sites-available/daynest
```

先用公网 IP 访问：

```nginx
server {
    listen 80;
    server_name _;

    root /var/www/day_nest/apps/web/dist;
    index index.html;

    client_max_body_size 20m;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

启用：

```bash
ln -sf /etc/nginx/sites-available/daynest /etc/nginx/sites-enabled/daynest
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

访问：

```text
http://你的服务器公网IP
```

## 13. 配置 HTTPS 证书

前提：

```text
域名 daynest.top 已解析到服务器公网 IP
腾讯云安全组已放行 80 / 443
Nginx 已能通过 http://daynest.top 访问
```

安装 Certbot：

```bash
apt update
apt install -y certbot python3-certbot-nginx
```

申请证书：

```bash
certbot --nginx -d daynest.top
```

如果输出类似下面内容，说明证书已经申请成功：

```text
Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/daynest.top/fullchain.pem
Key is saved at:         /etc/letsencrypt/live/daynest.top/privkey.pem
This certificate expires on 2026-08-19.
These files will be updated when the certificate renews.
Certbot has set up a scheduled task to automatically renew this certificate in the background.
```

如果同时看到：

```text
Deploying certificate
Could not install certificate
```

不用重新申请，证书已经存在，只是 Certbot 没能自动修改 Nginx。手动修改：

```bash
vim /etc/nginx/sites-available/daynest
```

改成：

```nginx
server {
    listen 80;
    server_name daynest.top www.daynest.top;

    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name daynest.top www.daynest.top;

    ssl_certificate /etc/letsencrypt/live/daynest.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/daynest.top/privkey.pem;

    root /var/www/day_nest/apps/web/dist;
    index index.html;

    client_max_body_size 20m;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

检查并重载：

```bash
nginx -t
systemctl reload nginx
```

然后修改 API 配置：

```bash
vim /etc/daynest/.env
```

至少改：

```ini
CORS_ORIGIN=https://daynest.top
```

如果七牛也绑定了 HTTPS CDN 域名，再改：

```ini
QINIU_DOMAIN=https://你的七牛CDN域名
```

重启 API：

```bash
cp /etc/daynest/.env /var/www/day_nest/apps/api/.env
pm2 restart daynest-api
```

验证 HTTPS：

```bash
curl -I https://daynest.top
```

## 14. 证书自动续期

Certbot 输出中如果有：

```text
Certbot has set up a scheduled task to automatically renew this certificate in the background.
```

说明自动续期任务已经安装。

检查 systemd timer：

```bash
systemctl list-timers | grep certbot
```

模拟续期：

```bash
certbot renew --dry-run
```

只要 Nginx 配置一直引用下面两个路径，续期后证书会自动更新到同一路径：

```nginx
ssl_certificate /etc/letsencrypt/live/daynest.top/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/daynest.top/privkey.pem;
```

建议增加续期后自动 reload Nginx：

```bash
mkdir -p /etc/letsencrypt/renewal-hooks/deploy

cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'EOF'
#!/bin/bash
nginx -t && systemctl reload nginx
EOF

chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

这样证书续期后，Nginx 会自动加载新证书。

## 15. 常用检查命令

```bash
# Nginx 配置是否正确
nginx -t

# Nginx 错误日志
tail -n 80 /var/log/nginx/error.log

# 前端构建产物是否存在
ls -lah /var/www/day_nest/apps/web/dist/index.html

# API 是否运行
pm2 status
pm2 logs daynest-api --lines 80

# 本机访问 API
curl -i http://127.0.0.1:3000/api/collections
```

未登录时 `/api/collections` 返回 `401 UNAUTHENTICATED` 是正常的，说明 API 已经通了。

## 16. 更新部署

```bash
cd /var/www/day_nest
git pull
pnpm install
pnpm -F @daynest/shared build
pnpm -F @daynest/api prisma:generate
pnpm -F @daynest/api prisma:deploy
pnpm build
pm2 restart daynest-api
nginx -t && systemctl reload nginx
```
