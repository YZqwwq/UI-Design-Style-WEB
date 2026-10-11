import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const entries = { tsc: 'typescript/bin/tsc', vite: 'vite/bin/vite.js' };
const [name, ...args] = process.argv.slice(2);
if (!Object.hasOwn(entries, name)) throw new Error('Unknown build tool');
// Pass paths as arguments, never through a .cmd shim or shell.
const [pkg,...relative] = entries[name].split('/');
const entry = path.join(path.dirname(require.resolve(`${pkg}/package.json`)),...relative);
const child = spawn(process.execPath, [entry, ...args], { stdio: 'inherit' });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
