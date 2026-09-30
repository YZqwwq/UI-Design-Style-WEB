import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run, BEGIN, END } from '../scripts/rules.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-rules-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manager = path.join(root, '.project-manager/rule-manager');
  const ruleDir = path.join(root, '.project-manager/rule');
  fs.mkdirSync(manager, { recursive: true }); fs.mkdirSync(ruleDir);
  const agent = path.join(root, 'AGENTS.md');
  fs.writeFileSync(agent, `前缀\n${BEGIN}\n${END}\n后缀\n`);
  fs.writeFileSync(path.join(ruleDir, 'a.md'), '# 规则 A\n正文 A\n');
  fs.writeFileSync(path.join(ruleDir, 'b.md'), '# 规则 B\n正文 B\n');
  const registry = { version: 1, rules: Object.fromEntries(['a', 'b'].map(id => [id, { path: `.project-manager/rule/${id}.md`, scope: id, lifetime: '任务结束', enabled: true }])) };
  fs.writeFileSync(path.join(manager, 'registry.json'), JSON.stringify(registry));
  const exec = (...args) => run(root, args, new Date('2026-09-29T00:00:00Z'));
  exec('sync', '--repair');
  return { root, manager, ruleDir, agent, registry, exec, text: () => fs.readFileSync(agent, 'utf8') };
}
test('共享引用、替换任务规则集、结束与幂等；保留生成区外文本', t => {
  const f = fixture(t);
  f.exec('activate', '--task', 'one', '--rules', 'a,b');
  f.exec('activate', '--task', 'two', '--rules', 'a');
  assert.equal(f.text().split('正文 A').length, 2);
  f.exec('activate', '--task', 'one', '--rules', 'b');
  f.exec('finish', '--task', 'two');
  assert.ok(!f.text().includes('正文 A')); assert.ok(f.text().includes('正文 B'));
  assert.equal(JSON.parse(f.exec('sync')).changed, false);
  f.exec('finish', '--task', 'one');
  assert.ok(!f.text().includes('正文 B'));
  assert.ok(f.text().startsWith('前缀\n')); assert.ok(f.text().endsWith('\n后缀\n'));
});
test('dry-run 不写入；源文件变更检测与同步；到期清理', t => {
  const f = fixture(t), before = f.text();
  f.exec('activate', '--task', 'one', '--rules', 'a', '--dry-run');
  assert.equal(f.text(), before);
  assert.deepEqual(JSON.parse(f.exec('status')).tasks, {});
  f.exec('activate', '--task', 'one', '--rules', 'a', '--expires-at', '2026-09-30T00:00:00Z');
  fs.appendFileSync(path.join(f.ruleDir, 'a.md'), '更新\n');
  assert.equal(JSON.parse(f.exec('status')).stale, true);
  f.exec('sync'); assert.ok(f.text().includes('更新'));
  run(f.root, ['prune'], new Date('2026-10-01T00:00:00Z'));
  assert.deepEqual(JSON.parse(f.exec('status')).tasks, {});
});
test('手动变更及丢失状态需显式修复', t => {
  const f = fixture(t);
  f.exec('activate', '--task', 'one', '--rules', 'a');
  fs.writeFileSync(f.agent, f.text().replace('正文 A', '手动正文'));
  assert.throws(() => f.exec('sync'), /不一致/);
  f.exec('sync', '--repair'); assert.ok(f.text().includes('正文 A'));
  fs.unlinkSync(path.join(f.manager, 'state.json'));
  assert.throws(() => f.exec('sync'), /不一致/);
  f.exec('sync', '--repair'); assert.ok(!f.text().includes('正文 A'));
});
test('拒绝错误输入、越界链接、缺失规则及重复标记', t => {
  const f = fixture(t);
  assert.throws(() => f.exec('activate', '--task', 'one', '--rules', 'missing'), /不存在/);
  assert.throws(() => f.exec('activate', '--task', 'one', '--rules', 'a', '--expires-at', 'yesterday'), /ISO/);
  assert.throws(() => f.exec('sync', '--unknown'), /参数/);
  fs.unlinkSync(path.join(f.ruleDir, 'a.md'));
  fs.symlinkSync(f.agent, path.join(f.ruleDir, 'a.md'));
  assert.throws(() => f.exec('activate', '--task', 'one', '--rules', 'a'), /越界/);
  fs.appendFileSync(f.agent, BEGIN);
  assert.throws(() => f.exec('sync', '--repair'), /标记/);
});
test('停用规则阻止同步，但允许释放引用；写锁阻止并发修改', t => {
  const f = fixture(t);
  f.exec('activate', '--task', 'one', '--rules', 'b');
  f.registry.rules.b.enabled = false;
  fs.writeFileSync(path.join(f.manager, 'registry.json'), JSON.stringify(f.registry));
  assert.throws(() => f.exec('sync'), /停用/);
  f.exec('finish', '--task', 'one');
  fs.writeFileSync(path.join(f.manager, 'write.lock'), '{}');
  assert.throws(() => f.exec('sync'), /锁定/);
  assert.equal(JSON.parse(f.exec('status')).inconsistent, false);
});
test('新检出空生成区可以初始化；已有临时文件不被删除', t => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.manager, 'state.json'));
  f.exec('activate', '--task', 'one', '--rules', 'a');
  fs.writeFileSync(`${f.agent}.tmp`, '待检查的旧文件');
  assert.throws(() => f.exec('finish', '--task', 'one'), /EEXIST/);
  assert.equal(fs.readFileSync(`${f.agent}.tmp`, 'utf8'), '待检查的旧文件');
  assert.equal(JSON.parse(f.exec('status')).inconsistent, false);
});
