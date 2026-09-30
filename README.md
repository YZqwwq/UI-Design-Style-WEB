# 设计图鉴 · Design Atlas

个人设计收集库，用于积累、整理和复用自己的设计参考。保留当前已有设计，以设计卡片为主要浏览入口，将设计规范转换为可复制给 AI 的提示词。

产品方向是高度自定义：用户可以按自己的方式定义风格分类，并将不同风格中的 UI 组合成自己的设计方案。项目不定位为设计交流广场。完整定位见[产品定位与目标](.project-manager/document/goals.md)。

## 仓库结构与职责

本项目使用 npm workspaces，根目录统一安装依赖、调度命令并管理前后端。项目 `.npmrc` 使用官方 npm registry，不修改全局 npm 配置。

```text
.
├── .project-manager/       # 统一管理前后端规则、skills、文档
├── AGENTS.md               # 全仓库协作入口
├── .env                    # 后端数据库配置，忽略提交
├── apps/
│   ├── web/                # 原生设计库 + React/TypeScript 登录组件 + Vite
│   │   ├── src/
│   │   ├── index.html
│   │   └── vite.config.js
│   └── api/                # Fastify + TypeScript
│       ├── src/
│       ├── db/             # 迁移与原始设计种子
│       ├── tests/
│       └── scripts/
├── scripts/                # 根级工具
├── package.json            # workspaces 与统一命令
└── package-lock.json       # 全仓库唯一依赖锁文件
```

前端负责渲染、交互和请求状态；后端负责数据库查询、筛选分页、请求校验与提示词生成。数据库、SQL 和种子仅在 API workspace 中。当前无需共享运行时代码，不预建空 contracts 包。

`.project-manager` 保持在仓库最外层；其中的规则按适用领域加载，纯后端任务不加载前端视觉规则。应用内部不维护另一套项目管理副本。

## 运行

使用 Node.js 24，仓库提供 `.nvmrc`。在仓库根目录执行：

```bash
nvm use
npm install
npm run dev
```

若 `nvm use` 提示版本尚未安装，先执行 `nvm install`。首次新工作副本需要复制 `.env.example` 到根目录 `.env` 并填写数据库配置；已有 `.env` 不要覆盖。新数据库初始化或升级新增 SQL 迁移时运行 `npm run db:migrate`，无需重建数据库。本轮账号迁移已在当前配置的数据库执行。

开发时浏览器打开 http://127.0.0.1:4173 。前端 Vite 使用 4173，后端 Fastify 使用 4174，`/api` 经 Vite 代理到后端。两个服务仅监听本机，根命令同时启动，Ctrl+C 同时停止。

从旧版升级时先 Ctrl+C 停止旧终端服务，再运行新命令，避免旧服务占用 4173。Vite 端口占用会明确失败，不自动跳到其他端口。需要更换开发端口时在同一根命令中设置：

```bash
WEB_PORT=5173 API_PORT=5174 npm run dev
```

## 命令

| 根目录命令 | 用途 |
| --- | --- |
| `npm run dev` | 同时启动前端 Vite 和 Fastify 开发服务 |
| `npm run dev:web` / `npm run dev:api` | 分别启动前端或后端 |
| `npm run db:check` | 验证根目录 .env 的远程数据库配置，执行只读查询 |
| `npm run db:migrate` | 执行 API workspace 内的迁移，已应用迁移不会重复执行 |
| `npm test` | 规则管理、后端接口、账号鉴权、密码哈希和隔离测试，无需数据库 |
| `npm run test:db` | 真实数据库只读集成测试 |
| `npm run test:auth:db` | 真实注册与隔离集成测试；创建随机临时账号并在结束时清理其全部数据 |
| `npm run typecheck` | 前端 React 组件与后端 TypeScript 类型检查 |
| `npm run build` | 构建前端到 apps/web/dist、后端到 apps/api/dist |
| `npm start` | Fastify 统一提供构建后的页面和 API，需先 build |

生产构建启动默认使用 4173，可用 `PORT=4180 npm start` 修改。开发双服务用 WEB_PORT/API_PORT；PORT 仅用于构建后统一服务。所有命令由根脚本委派，也可用 `npm run <命令> --workspace @design-atlas/api` 或进入对应应用目录运行。

前端构建产物必须配合 API 使用，不能单独当作完整静态应用。后端从模块位置解析仓库根 .env 和迁移目录，不依赖启动工作目录。

## 环境配置

服务端从仓库根目录的 `.env` 读取 `PGHOST`、`PGPORT`、`PGDATABASE`、`PGUSER`、`PGPASSWORD`。根命令和 workspace 命令使用同一份配置。凭据不会由终端中的同名变量覆盖，不输出到日志，不暴露给浏览器。

- `PGSSLMODE=disable`：当前公网直连方式；也支持 `verify-full`，用于校验证书的 TLS。
- `PGCONNECT_TIMEOUT=10`：连接超时秒数，允许 1–120。
- `PORT=4173`：构建后统一服务的端口，可用终端环境变量覆盖。
- `APP_ORIGIN=https://design.example.com`：公网部署时设置为浏览器访问的源地址，不带路径或结尾斜杠；HTTPS 时会话 Cookie 自动启用 Secure。本地开发默认允许 localhost 与 127.0.0.1 的 WEB_PORT，构建后服务使用 PORT。
- `WEB_PORT` / `API_PORT`：开发命令的终端环境变量，默认 4173 / 4174；前端不读取根目录数据库环境文件。

开发时 Fastify 仅提供 API，Vite 文件访问范围限于 web workspace。构建后 Fastify 仅提供 web/dist 内的文件；根目录 `.env`、数据库迁移、种子数据和后端源码不在 HTTP 静态资源范围内。支持开放用户名密码注册，每个账号拥有独立设计库。

## 数据迁移与现有内容保留

迁移入口为 `apps/api/db/migrate.ts`，SQL 在 `apps/api/db/migrations/`，初始设计在 `apps/api/db/seed/designs.ts`。

迁移使用事务和事务级锁，记录已执行文件及校验和。初始数据仅导入一次；重复执行不会覆盖已有模板，也不会重新补回用户后来删除的私有设计。发现同名 schema 不含本项目迁移记录时会停止，避免接管无关表。

已执行的 SQL 不应原地修改，应新增编号迁移。初始导入后修改种子文件不会自动更新线上记录。当前没有设计或分类管理写入 API，后续通过明确的数据迁移或新增管理功能维护。

## 账号与私有设计库

未登录时正常浏览公开初始化模板，支持搜索、筛选、详情与提示词；点击右上角 Sign in 才打开独立的居中登录/注册弹窗（半透明玻璃遮罩与背景模糊），宽屏双栏、小屏单栏，可返回设计库。登录后切换到个人库，退出或会话过期后回到公开模板。

直接开放用户名密码注册，无需邀请码。用户名为 3–32 位英文字母、数字或下划线，统一转小写；密码为 10–128 字符。注册成功自动登录，并在事务中复制初始化模板到该账号的私有库。原始 `categories`、`tags`、`designs` 保留为模板；`user_categories`、`user_tags`、`user_designs` 保存独立副本，不在登录时重复复制。

密码使用 Node.js 异步 scrypt（N=131072、r=8、p=1、随机 16 字节盐）；数据库只保存哈希。会话有效期 7 天，浏览器使用 HttpOnly、SameSite=Lax Cookie，数据库保存随机会话令牌的 SHA-256 摘要。退出会撤销会话；到期记录在创建新会话时清理。注册和登录有单进程尝试频率限制与密码计算并发限制，尚未支持分布式限流。

所有私有目录 API 都从已验证会话取得用户 ID，不接受客户端指定 owner。详情和提示词对不属于当前用户的 ID 返回 404；跨用户分类/标签关联由复合外键约束。前端退出时清空私有设计与属性，再加载公开模板；其他同源标签页通过 BroadcastChannel 同步账号变化。

所有非只读 API 请求必须带 `X-Atlas-Request: 1`；浏览器 Origin 如存在必须匹配允许的站点源，未启用跨域 CORS。前端已统一添加此请求头。本地服务经 Vite 代理使用同源 Cookie，不需要 Redis。

`user_identities` 已预留 Google/GitHub/QQ 身份绑定结构，但本轮没有实现或启用第三方授权路由；没有密码找回、密码修改或管理员账号管理页面。用户名密码由用户自行注册，不预置默认管理员。

## 前端组件结构

登录组件已接入 React、TypeScript、Tailwind v4 与 shadcn 风格的 Button，位于 `apps/web/src/components/ui/login-03.tsx`；独立挂载入口和作用域样式在 `apps/web/src/features/auth/`。设计库继续使用原生 JavaScript。组件在进入登录区域时按需加载，返回后卸载，用户名密码继续调用现有 Fastify API。配置、Props 与组件添加说明见 [登录组件说明](apps/web/src/features/auth/README.md)。

## 当前 API

| 方法与路径 | 行为 |
| --- | --- |
| `GET /api/health` | 检查数据库与设计表可读性，正常返回 200，异常返回 503 |
| `POST /api/auth/register` | `{ username, password }`；创建账号、复制模板并建立会话 |
| `POST /api/auth/login` | `{ username, password }`；验证后建立会话 |
| `POST /api/auth/logout` | 撤销当前会话并清除 Cookie |
| `GET /api/auth/me` | 返回当前 `{ user }`，未登录时为 null |
| `GET /api/public/catalog` | 访客读取公开模板分类和标签 |
| `GET /api/public/designs` | 访客搜索、筛选、分页读取公开模板 |
| `GET /api/public/designs/:id` | 读取单个公开模板，不能读取私有设计 ID |
| `POST /api/public/designs/:id/prompt` | 根据公开模板生成提示词，不写入数据 |
| `GET /api/catalog` | 读取当前用户的分类和标签 |
| `GET /api/designs` | 支持 `category`、`tag`、`query`、`limit`、`offset`，返回 `{ items, total }` |
| `GET /api/designs/:id` | 读取当前用户的单个设计，不存在或不属于本人返回 404 |
| `POST /api/designs/:id/prompt` | 请求体 `{ "purpose": "摄影作品集" }`，返回 `{ prompt }`；仅生成文本，不写数据库 |

筛选条件取交集；关键词按空白分词，每个词都需匹配。搜索使用参数化 SQL，`%`、`_` 和引号视为普通搜索文本。每页默认 24 条，上限 100；页面通过“加载更多”访问后续数据。

用途上限 160 字符，搜索上限 200 字符。用途会发送到本地后端生成提示词，但不会持久化或发送给 AI 服务。手动编辑的提示词保留在浏览器中。这里的提示词生成是模板拼接，不调用大模型。

## 当前产品能力与边界

网站界面使用统一的黑白灰主题：浅灰页面、白色容器、深色文字、黑底白字主操作与筛选选中态。主题变量集中在 `apps/web/src/style.css` 的 `:root`，设计预览及配色样本保留各自风格颜色。

保留全部 8 个原创 HTML/CSS 示例、6 类设计方向，以及搜索筛选、详情、提示词编辑复制、移动端布局和键盘操作。预览不是外部网站截图；数据库文本会转义后展示，配色和预览主题按受支持格式渲染。

自定义分类管理、跨风格 UI 组合编辑与保存属于后续产品方向，当前已完成前后端分离、真实数据库接入，以及开放注册和用户数据隔离；设计/分类的编辑保存界面仍待实现。

项目管理入口为 `AGENTS.md`；实际覆盖与验证记录见 [.project-manager/document/index.md](.project-manager/document/index.md)。
