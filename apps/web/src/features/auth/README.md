# 独立 Sign in 组件

页面保留原生设计库，登录功能以 React 组件挂载到 `index.html` 的 `#auth-root`。点击 Sign in 时动态加载 `mount.tsx` 和组件样式；居中原生 dialog 搭配半透明玻璃遮罩与背景模糊，提供焦点限制、右上角关闭按钮、Esc 返回及关闭后焦点恢复；小屏保持四周留白，内容过长时在弹窗内滚动。关闭时卸载 React root 并中止在途请求，表单密码不持久化。动画遵循 prefers-reduced-motion。

- `src/components/ui/login-03.tsx`：由用户提供的 Hirael Login 03 改编，桌面双栏、手机单栏；保留 SVG 线条、Motion 动画与来源许可，替换示例品牌与虚构引语。
- `src/components/ui/button.tsx`：提供的 shadcn 风格按钮、Radix Slot 和 cva 变体。
- `src/lib/utils.ts`：clsx + tailwind-merge 的 cn 工具。
- `src/features/auth/mount.tsx`：连接现有用户名密码 API，成功后通知设计库切换当前用户。
- `src/features/auth/auth.css`：Tailwind v4 theme/utilities 与限定在 auth-root 的组件样式。不导入 Preflight，避免修改现有原生页面的默认样式。

`Login03` 接收 `onHome`、`onAuthenticate(mode, credentials, signal)`；可选 `onGithub` 只有传入实际实现才显示 GitHub 按钮。目前未传入，不提供模拟跳转。默认登录与注册使用真实 `/api/auth/login`、`/api/auth/register`，没有添加虚假的条款/隐私链接。示例无需图片资产，视觉由提供的 SVG 绘制。

## 项目配置

前端现已安装 React/React DOM、Motion、Lucide、Radix Slot、cva、clsx、tailwind-merge、Tailwind v4 及其 Vite 插件、TypeScript 和 React 类型。依赖记录在 web package.json，根锁文件统一管理，新检出项目在根目录执行 `npm ci` 即可。

组件默认目录是 `apps/web/src/components/ui`，不是仓库根 `/components/ui`。`@` 通过 Vite 与 tsconfig 映射到 web 的 src，`components.json` 的 ui 别名为 `@/components/ui`。这使提供的导入路径直接可用，并让后续 shadcn CLI 把组件写入前端 workspace。不要在 monorepo 根部新建第二套组件目录。

这里已手工完成 shadcn 结构配置，不需要再次执行初始化 CLI。新增组件时可在 `apps/web` 中运行 `npx shadcn@latest add <组件名>`；检查其生成变更，不覆盖已有 Button 或 auth.css。参考 [shadcn 手工安装](https://ui.shadcn.com/docs/installation/manual) 和 [Tailwind Vite 安装](https://tailwindcss.com/docs/installation/using-vite)。

在仓库根目录执行 `npm run typecheck` 检查前后端类型，`npm run build` 构建两端。新增 Vite 插件后，已有开发服务需要重启一次。

来源：[Hirael Login 03](https://hirael.com/blocks/auth/login-03)，MIT 许可随组件保存在 `login-03.LICENSE`。
