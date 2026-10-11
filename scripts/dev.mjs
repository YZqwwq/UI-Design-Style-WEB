import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const children = [
  spawn(process.execPath, [path.join(path.dirname(require.resolve('vite/package.json')),'bin/vite.js')], { cwd: fileURLToPath(new URL('apps/web/', root)), stdio: 'inherit' }),
  spawn(process.execPath, ['--import', 'tsx', '--watch', 'src/main.ts'], { cwd: fileURLToPath(new URL('apps/api/', root)), stdio: 'inherit' }),
];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (!child.pid || child.exitCode !== null) continue;
    // Windows does not propagate kill() to the API watcher's child process.
    if (process.platform === 'win32') spawn('taskkill', ['/PID',String(child.pid),'/T','/F'], {stdio:'ignore',windowsHide:true});
    else child.kill();
  }
}
for (const child of children) {
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => stop(code ?? 1));
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(0));
