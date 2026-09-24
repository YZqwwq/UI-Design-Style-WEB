import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = ['index.html', 'src/app.js', 'src/catalog.js', 'src/style.css'];
await mkdir(path.join(root, 'dist/src'), { recursive: true });
for (const file of files) await copyFile(path.join(root, file), path.join(root, 'dist', file));
console.log(`Built ${files.length} public files into dist/.`);
