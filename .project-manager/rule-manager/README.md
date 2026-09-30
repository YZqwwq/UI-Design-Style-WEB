# 规则挂载管理

根目录统一管理前后端规则。Agent 判断任务属于哪个领域，脚本负责把对应源文件正文写入根目录 `AGENTS.md` 的 `project-rules:active` 区域。区域之外的内容保持原样。使用项目要求的 Node.js 24，在仓库根目录执行命令。

| 命令 | 用途 |
| --- | --- |
| `npm run rules -- list` | 列出登记规则与适用范围 |
| `npm run rules -- status` | 查看任务、过期记录、源文件错误、生成区是否需要同步或存在不一致 |
| `npm run rules -- activate --task page-layout --rules frontend-design` | 挂载前端规则；再次执行替换该任务的完整规则集 |
| `npm run rules -- activate --task rule-update --rules rule-writing,frontend-design` | 一个任务使用多条规则 |
| `npm run rules -- finish --task page-layout` | 释放指定任务的全部规则 |
| `npm run rules -- sync` | 按最新源文件重新生成挂载区 |
| `npm run rules -- prune` | 清理已到期任务并同步规则 |

所有修改命令支持 `--dry-run`，输出拟写入的任务状态和完整生成区，不写文件。可为 `activate` 添加 `--expires-at 2026-12-31T18:00:00+08:00`，必须带时区且为未来时间；不指定则直到任务结束。每次 activate 都重新指定完整规则集和有效期，不继承旧有效期。

多个任务引用同一规则时正文只写一次。结束一个任务不影响其他引用者，最后一个任务结束后生成区只剩标记与生成说明。脚本不会删除源规则，也不会自动判断自然语言任务或在后台倒计时；到期记录在下一次修改命令中清理。status 是只读报告，JSON 中 `expired`、`stale`、`inconsistent` 和 `errors` 需由调用方检查。

`registry.json` 为持久登记，规则源文件限定在 `.project-manager/rule/` 内，符号链接也不能越界。`enabled: false` 停用规则：仍有任务引用时同步报错，需要先 finish 或替换该任务规则集。缺失规则同样报错，不悄悄沿用旧正文。新规则需同时更新 AGENTS 的语义地图，不凭技术栈生成规则。

`state.json` 保存本地任务与上次生成区摘要，已加入 Git 忽略。注册表、源文件、脚本和测试应提交；生成区挂载期间会造成 AGENTS 工作区差异，提交前结束已完成任务。不要把其他会话仍在使用的任务一起清空。同一检出目录共享状态，使用不同任务 ID；不同 worktree 各自维护。

写入使用排他锁和单文件原子替换。两文件之间意外退出可能导致摘要不一致，此时普通修改会拒绝继续：先查看 status 与 AGENTS 差异，必要时备份手动内容，再执行 `npm run rules -- sync --repair --dry-run`，确认结果后执行 `npm run rules -- sync --repair`。修复以磁盘 state.json 的任务和当前源文件为准，会覆盖生成区；状态文件丢失时按空任务修复，不从旧正文猜测任务。损坏的 JSON、重复/残缺标记需人工修复后重试。

进程异常退出留下 `write.lock` 时，先检查文件中的 PID 对应进程确实已退出，才删除锁文件；残留 `AGENTS.md.tmp` 或 `state.json.tmp` 也应检查后清理。不要删除活动进程的锁。脚本只保护管理器之间的写入，不取代 Git 或编辑器的冲突管理。

卸载代表停止适用，无法从模型上下文中物理删除已读文字。AGENTS 的协作约定要求 Agent 在任务切换时调用管理器并重新读取；没有安装 IDE hook 或后台服务。

验证：`npm run test:rules`（临时目录测试，不改真实挂载状态）。
