import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/database.js';
import { createRepository, createTemplateRepository } from '../src/repository.js';

// Explicit npm run test:db only. PostgreSQL enforces read-only sessions here.
test('templates are retained and an unknown owner sees no private data', async t => {
  const config = await loadConfig();
  const pool = createPool({ ...config.db, options: '-c default_transaction_read_only=on' });
  t.after(() => pool.end());
  const repository = createRepository(pool);
  await repository.check();
  const templates = await pool.query('SELECT count(*)::int AS count FROM design_atlas.designs');
  assert.ok(templates.rows[0].count >= 8);
  const publicCatalog = createTemplateRepository(pool);
  assert.equal((await publicCatalog.list({}, '')).total, templates.rows[0].count);
  assert.equal((await publicCatalog.get('glass',''))?.name, '光的层次');
  assert.ok((await publicCatalog.metadata('')).categories.length >= 6);
  assert.equal((await publicCatalog.list({category:'极简主义',tag:'暗色'},'')).items[0].id,'mono');
  const owner = randomUUID();
  assert.deepEqual(await repository.list({},owner), {items:[],total:0});
  assert.deepEqual(await repository.metadata(owner), {categories:[],tags:[]});
  assert.equal(await repository.get('glass',owner),undefined);
});
