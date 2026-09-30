CREATE TABLE design_atlas.categories (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 80),
  position integer NOT NULL DEFAULT 0
);
CREATE TABLE design_atlas.tags (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 80),
  position integer NOT NULL DEFAULT 0
);
CREATE TABLE design_atlas.designs (
  id text PRIMARY KEY,
  category_id text NOT NULL REFERENCES design_atlas.categories(id),
  tag_id text NOT NULL REFERENCES design_atlas.tags(id),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX designs_category_idx ON design_atlas.designs(category_id);
CREATE INDEX designs_tag_idx ON design_atlas.designs(tag_id);
CREATE INDEX designs_position_idx ON design_atlas.designs(position, id);
