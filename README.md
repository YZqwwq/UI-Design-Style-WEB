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
nvm use 24.9.0
npm ci
npm run dev
```

Windows nvm 需要显式版本号；尚未安装时执行 `nvm install 24.9.0`，再运行 `nvm use 24.9.0`。也可使用已安装的其他 Node 24.x 版本。首次新工作副本需要复制 `.env.example` 到根目录 `.env` 并填写数据库配置；已有 `.env` 不要覆盖。新数据库初始化或升级新增 SQL 迁移时运行 `npm run db:migrate`，无需重建数据库。迁移应针对实际运行数据库执行；自动化测试的临时数据库不等于部署数据库。

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

迁移使用事务和事务级锁，记录已执行文件及校验和；兼容历史 Windows CRLF / Unix LF 换行差异，仍拒绝 SQL 内容变更。初始数据仅导入一次；重复执行不会覆盖已有模板，也不会重新补回用户后来删除的私有设计。发现同名 schema 不含本项目迁移记录时会停止，避免接管无关表。

已执行的 SQL 不应原地修改，应新增编号迁移。初始导入后修改种子文件不会自动更新线上记录。个人设计和分类通过现有管理 API 维护，公共初始化模板通过明确的数据迁移维护。

## 账号与私有设计库

未登录时正常浏览公开初始化模板，支持搜索、筛选、详情与提示词；点击右上角 Sign in 才打开独立的居中登录/注册弹窗（半透明玻璃遮罩与背景模糊），宽屏双栏、小屏单栏，可返回设计库。登录后切换到个人库，退出或会话过期后回到公开模板。

开放用户名密码注册，无需邀请码；新账号必须完成邮箱验证码验证，一个邮箱只能绑定一个账号，已有无邮箱账号仍可登录。显示名称为 1–32 个字符，保留大小写、允许重名；邮箱是唯一注册身份和登录账号；密码为 10–128 字符。注册成功自动登录，并在事务中复制初始化模板到该账号的私有库。原始 `categories`、`tags`、`designs` 保留为模板；`user_categories`、`user_tags`、`user_designs` 保存独立副本，不在登录时重复复制。

密码使用 Node.js 异步 scrypt（N=131072、r=8、p=1、随机 16 字节盐）；数据库只保存哈希。会话有效期 7 天，浏览器使用 HttpOnly、SameSite=Lax Cookie，数据库保存随机会话令牌的 SHA-256 摘要。退出会撤销会话；到期记录在创建新会话时清理。注册和登录有单进程尝试频率限制与密码计算并发限制，尚未支持分布式限流。

所有私有目录 API 都从已验证会话取得用户 ID，不接受客户端指定 owner。详情和提示词对不属于当前用户的 ID 返回 404；跨用户分类/标签关联由复合外键约束。前端退出时清空私有设计与属性，再加载公开模板；其他同源标签页通过 BroadcastChannel 同步账号变化。

所有非只读 API 请求必须带 `X-Atlas-Request: 1`；浏览器 Origin 如存在必须匹配允许的站点源，未启用跨域 CORS。前端已统一添加此请求头。本地服务经 Vite 代理使用同源 Cookie，不需要 Redis。

`user_identities` 已预留 Google/GitHub/QQ 身份绑定结构，但本轮没有实现或启用第三方授权路由；已支持修改密码并撤销全部会话、退出全部设备；尚无密码找回或管理员账号管理页面。用户名密码由用户自行注册，不预置默认管理员。

## 前端组件结构

登录组件已接入 React、TypeScript、Tailwind v4 与 shadcn 风格的 Button，位于 `apps/web/src/components/ui/login-03.tsx`；独立挂载入口和作用域样式在 `apps/web/src/features/auth/`。设计库继续使用原生 JavaScript。组件在进入登录区域时按需加载，返回后卸载，用户名密码继续调用现有 Fastify API。配置、Props 与组件添加说明见 [登录组件说明](apps/web/src/features/auth/README.md)。

## 当前 API

| 方法与路径 | 行为 |
| --- | --- |
| `GET /api/health` | 检查数据库与设计表可读性，正常返回 200，异常返回 503 |
| `POST /api/auth/register/email-code` | `{ email }`；发送注册验证码，成功返回重发等待时间与有效期 |
| `POST /api/auth/register` | `{ username, password, confirmation, email, code }`；后端校验确认密码与邮箱验证码，在同一事务内消费验证码、创建账号、复制模板并建立会话 |
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

已支持个人设计、分类和标签的新增、编辑与删除。首页品牌旁的 + 新建设计，详情中编辑当前设计，左栏管理分类和标签；点击用户名打开账号设置。跨风格 UI 组合编辑与保存尚未实现。

项目管理入口为 `AGENTS.md`；实际覆盖与验证记录见 [.project-manager/document/index.md](.project-manager/document/index.md)。

## 单机用户系统约定

### 开发与部署数据库选择

后端读取仓库根目录 `.env`，不存在时读取 `.ENV`（同时存在时优先小写文件）。同一文件中未加后缀的 `PGDATABASE`、`PGUSER`、`PGPASSWORD` 是正式配置；`PGDATABASE-test`、`PGUSER-test`、`PGPASSWORD-test` 是开发/测试配置。三个测试字段必须填写，缺失或为空不会回退正式值；测试库与正式库名称相同会拒绝开发连接。`PGHOST`、`PGPORT`、`PGSSLMODE`、`PGCONNECT_TIMEOUT` 可以共用，也可通过对应 `-test` 字段覆盖测试连接参数。

| 命令 | 数据库选择 |
| --- | --- |
| `npm run dev`、`npm run dev:api` | 测试库（本项目为 UI-test） |
| `npm run db:check`、`npm run db:migrate` | 测试库 |
| `npm run test:db`、`npm run test:auth:db` | 测试库 |
| `npm run build` | 仅构建，不连接数据库 |
| `npm start` | 正式库（本项目为 UI）；入口带 --production |
| `npm run db:check:prod` | 正式库，只读检查 |
| `npm run db:migrate:prod` | 正式库迁移，部署时显式执行 |

环境由启动入口明确选择，`NODE_ENV` 不会把 dev 或数据库测试切到正式库。连接检查显示实际数据库及环境，便于确认目标。开发工作区可仅保留测试凭据，生产工作区可仅保留正式凭据；数据库权限隔离仍应由远端账号权限保证。新建测试库第一次使用前需要单独运行 `npm run db:migrate`。

所有用户同级，不引入管理员权限、角色分流或 Redis。会话存储于 PostgreSQL，尝试次数及账号操作并发限制保存在单个服务进程内；进程重启会重置计数，不支持多进程共享限流。后端自行验证输入、身份、归属及密码确认；前端表单不执行安全判定，仅显示后端结果。浏览器不接触数据库连接配置或 SQL，文本仍通过转义安全渲染。

新增写入接口（全部要求登录和 X-Atlas-Request 请求头）：

| 接口 | 行为 |
| --- | --- |
| POST /api/designs | 新增个人设计；name、category、tag 必填，其余字段采用后端默认值 |
| PUT /api/designs/:id | 替换本人设计内容；分类和标签必须属于本人 |
| DELETE /api/designs/:id | 删除本人设计 |
| GET /api/categories、/api/tags | 读取本人的分类/标签 ID 与名称 |
| POST /api/categories、/api/tags | 以 { name } 新增 |
| PUT /api/categories/:id、/api/tags/:id | 以 { name } 重命名 |
| DELETE /api/categories/:id、/api/tags/:id | 删除；仍被设计引用时返回 409 |
| POST /api/auth/password | { currentPassword, password, confirmation }；成功后撤销全部会话 |
| POST /api/auth/logout-all | 空对象请求体，撤销本人的全部会话 |

资源归属取自后端会话，不接受 owner_id 或 role；未登录返回 401，跨用户操作返回 404。注册事务包含会话写入；数据库故障不会留下半完成账号。个人修改不更新公共模板。

构建工具通过 Node 直接启动，支持 Windows 含空格和 & 的项目路径。Windows 更换端口示例：

```powershell
$env:WEB_PORT='5173'
$env:API_PORT='5174'
npm run dev
```

本地运行 npm test、npm run typecheck、npm run build；配置专用测试数据库并迁移后运行 npm run test:db 与 npm run test:auth:db。后者创建唯一测试账号并清理，不应用生产数据库承担测试。Windows 无文件符号链接权限时仅跳过独立链接测试，其他规则断言照常运行；Linux CI 完整执行该项及数据库集成测试。


## 注册邮箱验证

配置根目录 `.env` 的 `MAIL_PROVIDER=aliyun`、`ALIBABA_CLOUD_ACCESS_KEY_ID`、`ALIBABA_CLOUD_ACCESS_KEY_SECRET`、`ALIYUN_DM_REGION_ID`、`MAIL_FROM_ADDRESS`、`MAIL_FROM_NAME`、`MAIL_REPLY_TO_ENABLED`，字段说明见 `.env.example`。服务端通过 HTTPS 调用 DirectMail SingleSendMail，不使用 SMTP。重启后端后生效；缺少邮件凭据不会阻止已有用户登录，但禁止发送验证码和新用户注册。邮件配置目前在开发/正式入口共用，开发时点击发送也会实际发信。

先对目标数据库执行迁移：开发为 `npm run db:migrate`，部署正式环境前显式执行 `npm run db:migrate:prod`。新增 `003_email_registration.sql` 为账号增加可空邮箱和验证时间，并创建注册验证码表；不重建已有账号和设计库。邮箱登录已实现；旧账号补绑邮箱、换绑和密码找回尚未实现。

验证码为随机 6 位数字，10 分钟有效、60 秒后可重发，同一邮箱每 10 分钟最多发送 5 次，每条验证码最多校验 5 次。重发替换旧验证码，成功注册后立即消费。数据库只保存带密钥的 HMAC 摘要，绑定邮箱、挑战 ID 和注册用途；使用邮件 AccessKey Secret 作为服务端密钥，轮换后需要重新获取验证码。邮箱去除首尾空格并统一小写，不删除点号或 `+` 后缀。

邮箱重发限制由数据库原子更新实现；另有单进程每 IP 10 次 / 10 分钟、全局 100 次 / 10 分钟的发信上限。邮件超时和失败不自动重试，无法确认发送成功的验证码不允许注册。发送状态与账号注册均由后端判定，浏览器倒计时只用于交互提示。发送成功请求会清理过期超过一天的未使用验证码记录。

`npm run test:auth:db` 使用模拟邮件发送器和真实测试库验证完整流程，不向测试地址实际发信；随机测试账号与验证记录在结束时清理。

邮箱身份调整：迁移 `004_email_identity.sql` 移除显示名称唯一约束，保留无邮箱旧账号的用户名唯一约束。重复邮箱返回 `EMAIL_TAKEN`。内部 API 登录标识仍通过 `username` 字段传递邮箱，以兼容现有调用结构；数据隔离始终使用用户 ID。
