import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const BEGIN = '<!-- project-rules:active:begin -->';
export const END = '<!-- project-rules:active:end -->';
const NOTICE = '<!-- 由 rules.mjs 生成，只修改源文件；卸载规则后停止适用。 -->';
const EMPTY_BLOCK = `${BEGIN}\n${NOTICE}\n${END}`;
const hash = value => createHash('sha256').update(value).digest('hex');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const validId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value);
function assert(ok, message) { if (!ok) throw new Error(message); }
function read(file, fallback) {
  try { return fs.readFileSync(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
}
function atomic(file, content) {
  const temp = `${file}.tmp`;
  let owned = false;
  try {
    const fd = fs.openSync(temp, 'wx'); owned = true;
    try { fs.writeFileSync(fd, content); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, file);
  } finally { if (owned && fs.existsSync(temp)) fs.unlinkSync(temp); }
}
function splitAgent(text) {
  const starts = text.split(BEGIN).length - 1;
  const ends = text.split(END).length - 1;
  assert(starts === ends && starts <= 1, 'AGENTS.md 挂载标记重复或不完整，请人工修复标记。');
  if (!starts) return { before: text, block: '', after: '' };
  const start = text.indexOf(BEGIN), end = text.indexOf(END) + END.length;
  assert(end > start + BEGIN.length, 'AGENTS.md 挂载标记顺序错误。');
  return { before: text.slice(0, start), block: text.slice(start, end), after: text.slice(end) };
}
function parse(args) {
  const [command = 'help', ...rest] = args;
  const options = {};
  const allowed = {
    help: [], list: [], status: [],
    activate: ['task', 'rules', 'expires-at', 'dry-run'],
    finish: ['task', 'dry-run'], sync: ['repair', 'dry-run'], prune: ['dry-run'],
  };
  assert(Object.hasOwn(allowed, command), `未知命令：${command}`);
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i].slice(2);
    assert(rest[i].startsWith('--') && allowed[command].includes(key) && !Object.hasOwn(options, key), `无效或重复参数：${rest[i]}`);
    if (['dry-run', 'repair'].includes(key)) options[key] = true;
    else { const value = rest[++i]; assert(value && !value.startsWith('--'), `--${key} 缺少值`); options[key] = value; }
  }
  return { command, options };
}

export function run(root, args, now = new Date()) {
  const { command, options } = parse(args);
  if (command === 'help') return 'rules list | status | activate --task ID --rules ID[,ID] [--expires-at ISO] | finish --task ID | sync [--repair] | prune\n修改命令支持 --dry-run。详见 .project-manager/rule-manager/README.md';
  const directory = path.join(root, '.project-manager/rule-manager');
  const agentFile = path.join(root, 'AGENTS.md');
  const stateFile = path.join(directory, 'state.json');
  const lockFile = path.join(directory, 'write.lock');
  const mutating = !['status', 'list'].includes(command) && !options['dry-run'];
  let lock;
  if (mutating) {
    try { lock = fs.openSync(lockFile, 'wx'); fs.writeFileSync(lock, json({ pid: process.pid, startedAt: now.toISOString() })); }
    catch (error) { if (error.code === 'EEXIST') throw new Error('规则管理器已锁定。确认 write.lock 中的进程已退出后才能删除锁重试。'); throw error; }
  }
  try {
    const registry = JSON.parse(read(path.join(directory, 'registry.json')));
    assert(registry.version === 1 && registry.rules && typeof registry.rules === 'object' && !Array.isArray(registry.rules), 'registry.json 格式错误');
    for (const [id, rule] of Object.entries(registry.rules)) {
      assert(validId(id) && typeof rule.path === 'string' && typeof rule.scope === 'string' && typeof rule.lifetime === 'string' && typeof rule.enabled === 'boolean', `规则登记无效：${id}`);
    }
    if (command === 'list') return json(registry.rules);
    const originalAgent = read(agentFile);
    const parts = splitAgent(originalAgent);
    const originalState = read(stateFile, '');
    const state = originalState ? JSON.parse(originalState) : { version: 1, tasks: {}, blockHash: hash(parts.block === EMPTY_BLOCK ? EMPTY_BLOCK : '') };
    assert(state.version === 1 && state.tasks && typeof state.tasks === 'object' && !Array.isArray(state.tasks) && typeof state.blockHash === 'string', 'state.json 格式错误；请检查或从备份恢复。');
    for (const [id, task] of Object.entries(state.tasks)) {
      assert(validId(id) && Array.isArray(task.rules) && task.rules.every(validId) && (task.expiresAt === null || (typeof task.expiresAt === 'string' && Number.isFinite(Date.parse(task.expiresAt)))), `任务状态无效：${id}`);
    }
    const mismatch = hash(parts.block) !== state.blockHash;
    const expired = Object.entries(state.tasks).filter(([, task]) => task.expiresAt && Date.parse(task.expiresAt) <= now.getTime()).map(([id]) => id);
    if (command !== 'status') {
      assert(!mismatch || options.repair, '挂载区与 state.json 不一致。先查看 status 和文件差异，再使用 sync --repair --dry-run 预览修复。');
      for (const id of expired) delete state.tasks[id];
    }
    if (command === 'activate') {
      assert(validId(options.task), '--task 必须是小写字母、数字和连字符组成的 1–80 位标识');
      const ids = options.rules?.split(',');
      assert(ids?.length && ids.every(validId), '--rules 需要逗号分隔的规则 ID');
      let expiresAt = null;
      if (options['expires-at']) {
        assert(/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(options['expires-at']) && Date.parse(options['expires-at']) > now.getTime(), '--expires-at 必须是带时区且位于未来的 ISO 时间');
        expiresAt = new Date(options['expires-at']).toISOString();
      }
      state.tasks[options.task] = { rules: [...new Set(ids)].sort(), expiresAt };
    }
    if (command === 'finish') { assert(validId(options.task), 'finish 需要有效的 --task'); delete state.tasks[options.task]; }
    const active = Object.entries(state.tasks).filter(([, task]) => !task.expiresAt || Date.parse(task.expiresAt) > now.getTime());
    const ids = [...new Set(active.flatMap(([, task]) => task.rules))].sort();
    const errors = [];
    const bodies = [];
    for (const id of ids) {
      try {
        const rule = registry.rules[id];
        assert(rule?.enabled, `规则不存在或已停用：${id}；先 finish 对应任务或 activate 替换规则集。`);
        const base = fs.realpathSync(path.join(root, '.project-manager/rule'));
        const source = fs.realpathSync(path.resolve(root, rule.path));
        const relative = path.relative(base, source);
        assert(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) && source.endsWith('.md'), `规则路径越界：${id}`);
        const body = read(source).trim();
        assert(![BEGIN, END].some(marker => body.includes(marker) || rule.scope.includes(marker) || rule.lifetime.includes(marker)), `规则包含保留标记：${id}`);
        bodies.push(`### ${id}\n\n来源：\`${rule.path}\`；适用：${rule.scope}；退出条件：${rule.lifetime}。\n相对 Markdown 链接以源文件所在目录解析。\n\n${body}`);
      } catch (error) { errors.push(`${id}: ${error.message}`); }
    }
    const block = `${BEGIN}\n${NOTICE}\n${bodies.length ? `\n## 当前挂载规则\n\n${bodies.join('\n\n')}\n\n` : ''}${END}`;
    if (command === 'status') return json({ tasks: state.tasks, expired, activeRules: ids, inconsistent: mismatch, stale: parts.block !== block, errors });
    assert(errors.length === 0, errors.join('\n'));
    const nextAgent = parts.block ? parts.before + block + parts.after : originalAgent + (originalAgent.endsWith('\n') ? '\n' : '\n\n') + block + '\n';
    state.tasks = Object.fromEntries(Object.entries(state.tasks).sort(([a], [b]) => a.localeCompare(b)));
    state.blockHash = hash(block);
    const nextState = json(state);
    if (options['dry-run']) return json({ command, expiredRemoved: expired, tasks: state.tasks, agentChanged: originalAgent !== nextAgent, stateChanged: originalState !== nextState, generatedBlock: block });
    // Two files cannot be atomically replaced together. Persist state last; an interruption
    // leaves a detectable mismatch, repaired explicitly from the last committed state.
    if (originalAgent !== nextAgent) atomic(agentFile, nextAgent);
    if (originalState !== nextState) atomic(stateFile, nextState);
    return json({ command, activeRules: ids, tasks: Object.keys(state.tasks), changed: originalAgent !== nextAgent || originalState !== nextState, expiredRemoved: expired });
  } finally {
    if (lock !== undefined) { fs.closeSync(lock); fs.unlinkSync(lockFile); }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(run(fileURLToPath(new URL('../../', import.meta.url)), process.argv.slice(2))); }
  catch (error) { console.error(`规则管理失败：${error.message}`); process.exitCode = 1; }
}
