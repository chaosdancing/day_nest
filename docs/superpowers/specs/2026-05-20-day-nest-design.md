# DayNest · 家庭日常记录网站 — 设计文档

> 写于 2026-05-20。本文是项目的设计基线（spec），用于驱动后续实现计划的编写。

## 1. 目标与定位

为一个家庭搭建私有的"日常记录"网站，用于沉淀**旅行、子女成长、个人高光时刻**这类回忆。内容形态以 **图片 + 文字描述** 为主，按"一次一个集合"组织。设计风格走 **拍立得手账风**，强调"打开就像翻一本相册"的情绪。

**核心场景**

- 妈妈周末把过去一周拍的孩子照片整理成一个集合
- 一年后翻回去，按时间轴看到"那段时间发生过什么"
- 想看"所有带 樱花 标签的回忆"，进入软木板视图一目了然
- 全家成员都能上传、编辑、浏览

## 2. 范围与非目标

**包含**：账号登录、集合 CRUD、照片上传与浏览、标签系统、时间轴 / 软木板 / 集合详情三种浏览视图、移动端体验。

**不包含（V1 之外）**：

- 评论 / 点赞 / 回复
- 视频内容（仅图片）
- 全文搜索（V1 仅支持按标签 / 按标题模糊匹配）
- 多家庭 / 多租户隔离（仅一个家庭使用）
- 邀请链接、临时分享（纯私享，登录才能看）
- 复杂的草稿态 / 发布流（集合创建后立即可见）

## 3. 用户与权限模型

- 家庭成员各自一个账号（用户名 / 密码 + JWT）
- 所有登录用户**权限等同**：可以看、可以传、可以改、可以删任何内容
- 每张照片 / 每个集合记录 `uploaded_by` 字段以便显示"这张是爸爸拍的"
- 没有"管理员"角色；初始账号通过后端一次性脚本（`pnpm seed`）创建，之后由现有用户在设置页"邀请家人"——产生一次性注册口令

## 4. 技术栈

### 4.1 前端

- React 18 + Vite + TypeScript
- TailwindCSS + shadcn/ui（可定制基础组件）
- Framer Motion（页面 / 元素动画）
- Embla Carousel（横向轮播 / 图片浏览器）
- React Router v6（路由）
- TanStack Query（数据请求与缓存）
- `zustand`（轻量全局态：当前用户、上传队列）

### 4.2 后端

- Node.js 20 + Fastify + TypeScript
- Prisma ORM + SQLite（数据库文件位于 VPS 本地）
- `argon2` 做密码哈希（比 bcrypt 更现代、抗 GPU）
- `jose` 做 JWT 签发与校验
- `qiniu` 官方 Node SDK（生成上传 token、签发私有下载 URL）
- `zod`（请求体与配置校验）
- `pino`（结构化日志）
- `vitest` + `supertest` 做后端测试

### 4.3 部署

- 国内轻量应用服务器（阿里云或腾讯云，¥30-40/月）
- Nginx 反向代理：`/api/*` → Node 服务；`/` → 前端静态文件
- 后端进程用 `pm2` 守护，自动拉起
- 数据库每日 cron 备份：`sqlite3 .backup` → 加密压缩 → 上传到七牛云的 `backups/` 前缀

### 4.4 存储

- 七牛云 Kodo 桶，桶设为**私有**
- 文件键命名：`photos/{collectionId}/{photoId}.{ext}`（不暴露原始文件名）
- 缩略图通过七牛云图片处理 API 在 URL 上加 `?imageMogr2/thumbnail/x800` 等参数即时生成，免缓存维护
- 私有下载用后端签发的短期 URL（默认 1 小时有效）

## 5. 领域模型

```
User
  id (uuid)
  username (unique)
  display_name
  password_hash
  avatar_key            // 七牛 key，可为空
  created_at

Collection
  id (uuid)
  title
  description           // markdown，可为空
  occurred_on           // 集合的"日期"（用户填写的回忆时间），用于时间轴排序
  occurred_until        // 可为空（多日活动如旅行）
  location              // 自由文本，可为空
  cover_photo_id        // 指向某张 Photo，默认是首张
  created_by (User.id)
  created_at
  updated_at

Photo
  id (uuid)
  collection_id
  file_key              // 七牛 key
  width, height         // 原图尺寸（上传时记录，用于布局占位）
  caption               // 单张描述，可为空
  taken_at              // 拍摄时间（EXIF 提取或上传时间）
  order_index           // 集合内排序
  uploaded_by (User.id)
  created_at

Tag
  id (uuid)
  name (unique, normalized)        // 小写、trim 空白
  display_name                     // 原始大小写
  created_by
  created_at

PhotoTag      // photo ↔ tag 多对多
  photo_id
  tag_id

CollectionTag // collection ↔ tag 多对多（允许独立打标）
  collection_id
  tag_id
```

**派生概念（不落表，查询时计算）**：

- 集合的"实际标签合集" = 直接的 `CollectionTag` ∪ 该集合下所有照片的 `PhotoTag`
- 这是软木板视图聚类时使用的字段

## 6. 路由 / 页面

| 路径 | 页面 | 说明 |
| --- | --- | --- |
| `/login` | 登录页 | 用户名 + 密码 |
| `/register?token=xxx` | 注册页 | 凭一次性 token 自助创建账号 |
| `/` | 时间轴主页 | 默认入口，按 `occurred_on` 倒序，左右交错拍立得布局 |
| `/tags` | 软木板（全标签） | 顶部是所有标签的胶带条，主区域是按标签聚类的封面 |
| `/tags/:name` | 软木板（单标签） | 单标签下的所有集合封面，平铺软木板 |
| `/c/:id` | 集合详情 | 集合元数据 + 照片瀑布 + 描述 |
| `/c/:id/p/:photoIndex` | 全屏照片浏览器 | URL 状态化，支持分享 / 后退 |
| `/upload` | 上传页 | 拖入照片 → 编辑元数据 → 创建集合 |
| `/settings` | 设置 | 改密码、改头像、邀请家人、登出 |

## 7. 视觉设计语言

**主题**：拍立得手账风（C 方向）

**色彩**

- 背景：`#f1ece1`（米黄牛皮纸），叠加微弱 noise + 角落径向阴影
- 主文字：`#2b2418`
- 强调色：`#a88a5c`（牛皮绳色），用于强调标签、时间轴轴线、按钮
- 辅助色：`#d23b3b`（红图钉）/ `#3b6ed2`（蓝图钉）等点缀色
- 拍立得照片：`#ffffff` 卡片 + 16-28px 不等宽边框（底边更宽）

**字体**

- 中文正文：思源宋体 / 苹方 fallback
- 英文 / 数字：`Inter`
- 手写体（标题、标签胶带）：`Caveat` / `Permanent Marker`（Google Fonts）
- 时间日期：等宽 `JetBrains Mono`，营造"打字机标签"感

**核心装饰元素**

- 拍立得卡片：白底 + 底边宽边框 + 投影 + 轻微 `rotate(±1°~±6°)` 随机倾斜
- 胶带：半透明黄 `rgba(255, 240, 160, 0.7)`，旋转 -2°，常用于标签和便签
- 图钉：纯色圆点 + 投影，用于软木板
- 手写涂鸦：箭头、爱心、星标，用 SVG 内联，悬停 / 点击时偶现

## 8. 交互动效

技术：Framer Motion 为主，必要时配合 GSAP（如时间轴的 scroll trigger）。**移动端禁用过重动效**，仅保留入场淡入、点击反馈。

**关键动画清单**

| 场景 | 动画 |
| --- | --- |
| 时间轴卡片入场 | 滚动到视口时，`y: 20 → 0` + `opacity 0 → 1` + 轻微旋转回正（150ms 错位） |
| 拍立得 hover | `scale: 1 → 1.04` + 旋转回 0°（"被拿起来看"），投影变大 |
| 集合卡片点击 | shared-layout 动画（Framer Motion `layoutId`），封面从时间轴位置"飞"到集合详情顶图 |
| 软木板拖动 | 鼠标 / 触屏拖动整面板平移，滚轮缩放（限制 0.5x – 2x） |
| 进入集合详情 | 拍立得们错位掉落（`y: -40 → 0`，stagger 60ms） |
| 全屏照片浏览 | 左右滑切换（Embla Carousel）+ 进出场 `scale + opacity` |
| 上传成功 | 照片飞入"已上传"区，伴随相机快门 `↗ shutter.svg` 一次性动画 |
| 标签点击 | 胶带条"撕下来"飞向页面顶部（200ms） |

## 9. 关键流程

### 9.1 上传集合

1. 用户进入 `/upload`。桌面端拖入照片到放置区；移动端点击"从相册选"打开系统选择器，或点击"拍一张"调用 `<input type="file" accept="image/*" capture="environment">` 直接拍摄
2. 单次最多 50 张，超过给出友好提示
3. 前端在浏览器读取每张图：提取尺寸、EXIF 拍摄时间，生成本地预览缩略图
4. 前端调用 `POST /api/uploads/token` → 后端返回七牛云上传 token + 资源 key 前缀
5. 前端**并行**直传到七牛云（不经过后端）；UI 显示每张进度条
6. 上传完成后，前端填写：集合标题、occurred_on、描述、标签、每张的 caption
7. 提交 `POST /api/collections`，后端事务性写入 `Collection` + `Photo` + `Tag` 关联
8. 跳转到 `/c/:id`，shared-layout 动画进入

### 9.2 浏览主页时间轴

1. `GET /api/collections?limit=20&cursor=...`，按 `occurred_on DESC` 游标分页
2. 后端返回每个集合的：基础元数据 + 封面 photo 的预签名缩略图 URL + 标签合集
3. 前端按"左 - 右 - 左 - 右"交错布局，第一屏 SSR 不需要，骨架屏即可
4. 滚动接近底部触发下一页

### 9.3 软木板按标签浏览

`/tags` 总览页（多标签聚类视图）：

1. `GET /api/tags` 返回所有标签及其计数
2. 顶部显示热度前 8 的标签"胶带条"（按引用次数排序），右侧"更多"按钮点开抽屉看全部
3. 主区域呈现一面大软木板，**按热度前 N（默认 5）**的标签自成"簇"——每簇是一张写着标签名的便签 + 周围环绕该标签下的 3-5 张封面拍立得（更多用"还有 N 张"叠落卡示意）
4. 簇与簇之间用"线绳"连接（共享标签的视觉提示），SVG 绘制
5. 整面板可拖动平移、滚轮缩放（0.5x – 2x）

`/tags/:name` 单标签深入：

1. 进入路由：`GET /api/collections?tag=:name` 返回所有带该标签的集合 + 封面缩略图
2. 前端在软木板背景上以"图钉 + 拍立得"形式自由摆放，每张封面的位置 / 角度由 `hash(photoId)` 生成 deterministic 值，刷新位置稳定
3. 点击任一拍立得 → 跳转 `/c/:id`

### 9.4 集合详情

1. `GET /api/collections/:id` 返回元数据 + 照片列表（含预签名缩略图）
2. 顶部是大封面 + 标题 + 日期 + 标签胶带
3. 下方是照片瀑布（拍立得卡片，可垂直滚动）
4. 点击单张 → URL 切到 `/c/:id/p/:index`，进入全屏浏览器
5. 全屏浏览器内显示**原图**（再签一次大图 URL，1 小时有效）

## 10. 认证与安全

- 注册：仅凭"邀请 token"（设置页生成，一次性，72 小时有效）
- 登录：用户名 + 密码，返回 access token（15 分钟）+ refresh token（30 天，HttpOnly Cookie）
- 所有 `/api/*` 接口要求 access token（`/api/auth/*` 除外）
- 密码用 argon2id 哈希，参数：memory=64MB time=3 parallelism=2
- 七牛云上传 token 上限 1 小时；下载签名 URL 上限 1 小时
- 七牛云密钥 (`AK`/`SK`) 仅存在后端 `.env`，永不下发到前端
- 后端启用 CORS，仅允许部署的前端域名

## 11. 部署拓扑

```
                ┌────────────────────────────────┐
                │   家庭成员的浏览器 / 手机       │
                └──────────────┬─────────────────┘
                               │ HTTPS
                               ▼
                ┌────────────────────────────────┐
                │  VPS (¥30-40/月)                │
                │  ┌───────────────────────────┐ │
                │  │ Nginx (443, certbot 续签)  │ │
                │  └──┬───────────┬────────────┘ │
                │     │           │               │
                │     ▼           ▼               │
                │  /         /api/*               │
                │  ┌──────┐  ┌─────────────────┐ │
                │  │静态  │  │ Fastify (pm2)   │ │
                │  │文件  │  │  + SQLite 文件  │ │
                │  └──────┘  └────────┬────────┘ │
                └─────────────────────┼──────────┘
                                      │
                                      ▼ qiniu SDK
                            ┌──────────────────────┐
                            │ 七牛云 Kodo (私有桶) │
                            │  photos/* | backups/*│
                            └──────────────────────┘
```

域名 + HTTPS：使用一个二级域名（如 `nest.example.com`），Let's Encrypt 证书。

## 12. 风险与开放问题

| 风险 | 缓解 |
| --- | --- |
| 七牛云私有桶 + 国内 CDN 加速：要确认 CDN 节点能正确转发签名 URL | 部署时实测；备选用"裸 Kodo 域名 + 源站签名"（速度略差但一定能用） |
| SQLite 单点：磁盘损坏会全丢 | 每日加密备份到七牛 `backups/` 前缀；保留 30 天 |
| 移动端上传大图慢 / 流量大 | 前端可选"上传前压缩"（用 `browser-image-compression`），默认开启、可关闭 |
| 拍立得倾斜随机数若不稳定，每次刷新角度变化会令人晕 | 用照片 id 的 hash 生成 deterministic 角度 |
| 七牛云 API 变更或欠费 | 抽象成 `StorageProvider` 接口（V1 只实现七牛），日后换 COS / S3 改一个文件即可 |

## 13. 验收标准（V1 完成的定义）

- 我可以在 VPS 上跑起整个系统（前端、后端、Nginx），并通过 HTTPS 访问
- 我可以创建第一个用户、登录、邀请家人
- 我可以新建一个集合，上传 20 张照片，给若干张打标签
- 主页能看到所有集合，按 `occurred_on` 倒序，时间轴布局正确
- 进入集合详情能看到所有照片缩略图，点击可以全屏看原图
- 软木板视图能看到至少一个标签下的所有集合封面
- 全程在 iPhone Safari 上可以正常完成上面所有动作
- 关键动效（卡片入场、shared-layout 进集合、全屏切换）在桌面端流畅（>50fps）
- 数据库每日有备份上传到七牛云

## 14. 项目代号与目录结构

代号：**DayNest**（"日常巢"）

仓库结构（monorepo，便于一份 README 启动）：

```
day_nest/
├── apps/
│   ├── web/                 # 前端 (Vite + React)
│   └── api/                 # 后端 (Fastify)
├── packages/
│   └── shared/              # 前后端共享类型 (zod schema)
├── docs/
│   └── superpowers/specs/   # 本文档位置
├── docker/
│   └── nginx.conf           # 部署配置参考
├── scripts/
│   ├── backup-db.sh         # SQLite 每日备份
│   └── seed.ts              # 初始账号 / 演示数据
├── package.json             # pnpm workspaces
└── README.md
```
