import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { apiRoot, repositoryRoot, migrationsDirectory, webDist } from '../src/paths.js';

test('workspace paths locate root config, migrations and web build independently of cwd', async () => {
  const manifest = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
  assert.deepEqual(manifest.workspaces, ['apps/*']);
  assert.equal(apiRoot, path.join(repositoryRoot, 'apps/api'));
  assert.equal(webDist, path.join(repositoryRoot, 'apps/web/dist'));
  assert.ok((await readFile(path.join(migrationsDirectory, '001_catalog.sql'), 'utf8')).includes('CREATE TABLE design_atlas.designs'));
});
