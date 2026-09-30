import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function findApiRoot() {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (true) {
    const manifest = path.join(directory, 'package.json');
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === '@design-atlas/api') return directory;
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error('Cannot locate API workspace');
    directory = parent;
  }
}

// Resolve from module location, not npm's workspace-dependent working directory.
export const apiRoot = findApiRoot();
export const repositoryRoot = path.resolve(apiRoot, '../..');
export const webDist = path.join(repositoryRoot, 'apps/web/dist');
export const migrationsDirectory = path.join(apiRoot, 'db/migrations');
