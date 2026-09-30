import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { designs } from './seed/designs.js';
import { migrationsDirectory } from '../src/paths.js';

export async function migrate(pool: Pool, directory = migrationsDirectory) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('design-atlas-migrations'))");
    // Do not adopt or change unrelated existing tables with the same namespace.
    const existing = await client.query("SELECT to_regnamespace('design_atlas') AS namespace, to_regclass('design_atlas.schema_migrations') AS ledger");
    if (existing.rows[0].namespace && !existing.rows[0].ledger) throw Object.assign(new Error(), { code: 'MIGRATION_CONFLICT' });
    await client.query('CREATE SCHEMA IF NOT EXISTS design_atlas');
    await client.query('CREATE TABLE IF NOT EXISTS design_atlas.schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const name of (await readdir(directory)).filter(name => /^\d+_.*\.sql$/.test(name)).sort()) {
      const sql = await readFile(path.join(directory, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = await client.query('SELECT checksum FROM design_atlas.schema_migrations WHERE name = $1', [name]);
      if (previous.rowCount) {
        if (previous.rows[0].checksum !== checksum) throw Object.assign(new Error(), { code: 'MIGRATION_CHANGED' });
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO design_atlas.schema_migrations(name, checksum) VALUES ($1, $2)', [name, checksum]);
    }
    // Seed exactly once, in the same transaction as the migration. Never overwrite edits.
    const seeded = await client.query("SELECT 1 FROM design_atlas.schema_migrations WHERE name = 'seed-001'");
    if (!seeded.rowCount) {
      const categories = [...new Set(designs.map(d => d.category))];
      const tags = ['简洁', '大胆', '通透', '理性', '暗色', '复古'];
      for (const [i, name] of categories.entries()) {
        await client.query('INSERT INTO design_atlas.categories(id, name, position) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [`category-${i + 1}`, name, i]);
      }
      for (const [i, name] of tags.entries()) {
        await client.query('INSERT INTO design_atlas.tags(id, name, position) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [`tag-${i + 1}`, name, i]);
      }
      for (const [i, design] of designs.entries()) {
        const { id, category, tag, ...content } = design;
        await client.query(`INSERT INTO design_atlas.designs(id, category_id, tag_id, content, position)
          VALUES ($1, (SELECT id FROM design_atlas.categories WHERE name = $2),
            (SELECT id FROM design_atlas.tags WHERE name = $3), $4, $5) ON CONFLICT (id) DO NOTHING`,
        [id, category, tag, JSON.stringify(content), i]);
      }
      await client.query("INSERT INTO design_atlas.schema_migrations(name, checksum) VALUES ('seed-001', $1)", [createHash('sha256').update(JSON.stringify(designs)).digest('hex')]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
