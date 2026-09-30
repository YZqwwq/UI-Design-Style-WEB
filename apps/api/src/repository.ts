import type { Pool } from 'pg';
import type { CatalogRepository, Filters, Design, CatalogPage } from './types.js';

const joined = `SELECT d.id, d.position,
  d.content || jsonb_build_object('id', d.id, 'category', c.name, 'tag', t.name) AS item
  FROM design_atlas.user_designs d
  JOIN design_atlas.user_categories c ON c.id = d.category_id AND c.owner_id = d.owner_id
  JOIN design_atlas.user_tags t ON t.id = d.tag_id AND t.owner_id = d.owner_id`;

export function createRepository(pool: Pool): CatalogRepository { return repository(pool, false); }
export function createTemplateRepository(pool: Pool): CatalogRepository { return repository(pool, true); }
function repository(pool: Pool, templates: boolean): CatalogRepository {
  const source = templates ? joined.replaceAll('user_designs','designs').replaceAll('user_categories','categories').replaceAll('user_tags','tags').replaceAll(' AND c.owner_id = d.owner_id','').replaceAll(' AND t.owner_id = d.owner_id','') : joined;
  return {
    async list({ category = '', tag = '', query = '', limit = 24, offset = 0 }: Filters, ownerId: string): Promise<CatalogPage> {
      // strpos treats %, _, quotes and backslashes as literal search text.
      // Every term must match, preserving the previous UI's intersection semantics.
      const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const result = await pool.query(`WITH filtered AS (
        ${source}
        WHERE ${templates ? '' : 'd.owner_id = $6 AND'} ($1::text = '' OR c.name = $1) AND ($2::text = '' OR t.name = $2)
          AND NOT EXISTS (SELECT 1 FROM unnest($3::text[]) term WHERE strpos(lower(concat_ws(' ',
            d.content->>'name', d.content->>'english', c.name, t.name, d.content->>'description',
            d.content->>'use', d.content->'colors')), term) = 0)
        ), page AS (SELECT * FROM filtered ORDER BY position, id LIMIT $4 OFFSET $5)
        SELECT (SELECT count(*)::int FROM filtered) AS total,
          COALESCE((SELECT jsonb_agg(item ORDER BY position, id) FROM page), '[]'::jsonb) AS items`,
      [category, tag, terms, limit, offset, ...(templates ? [] : [ownerId])]);
      return result.rows[0];
    },
    async get(id: string, ownerId: string): Promise<Design | undefined> {
      const result = await pool.query(`${source} WHERE d.id = $1 ${templates ? '' : 'AND d.owner_id = $2'}`, [id, ...(templates ? [] : [ownerId])]);
      return result.rows[0]?.item;
    },
    async metadata(ownerId: string) {
      const result = await pool.query(`SELECT
        COALESCE((SELECT jsonb_agg(name ORDER BY position, id) FROM design_atlas.${templates ? 'categories' : 'user_categories WHERE owner_id = $1'}), '[]'::jsonb) AS categories,
        COALESCE((SELECT jsonb_agg(name ORDER BY position, id) FROM design_atlas.${templates ? 'tags' : 'user_tags WHERE owner_id = $1'}), '[]'::jsonb) AS tags`, templates ? [] : [ownerId]);
      return result.rows[0];
    },
    async check() { await pool.query('SELECT 1 FROM design_atlas.designs LIMIT 1'); },
  };
}
