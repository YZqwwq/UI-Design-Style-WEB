-- Existing catalog tables remain the initialization templates. User libraries are copies.
CREATE TABLE design_atlas.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,32}$'),
  disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE design_atlas.password_credentials (
  user_id uuid PRIMARY KEY REFERENCES design_atlas.users(id) ON DELETE CASCADE,
  password_hash text NOT NULL
);
CREATE TABLE design_atlas.user_identities (
  provider text NOT NULL CHECK (provider IN ('google','github','qq')),
  subject text NOT NULL,
  user_id uuid NOT NULL REFERENCES design_atlas.users(id) ON DELETE CASCADE,
  PRIMARY KEY (provider, subject),
  UNIQUE (user_id, provider)
);
CREATE TABLE design_atlas.sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES design_atlas.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON design_atlas.sessions(user_id);
CREATE INDEX sessions_expiry_idx ON design_atlas.sessions(expires_at);
CREATE TABLE design_atlas.user_categories (
  owner_id uuid NOT NULL REFERENCES design_atlas.users(id) ON DELETE CASCADE,
  id text NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY(owner_id,id), UNIQUE(owner_id,name)
);
CREATE TABLE design_atlas.user_tags (
  owner_id uuid NOT NULL REFERENCES design_atlas.users(id) ON DELETE CASCADE,
  id text NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY(owner_id,id), UNIQUE(owner_id,name)
);
CREATE TABLE design_atlas.user_designs (
  owner_id uuid NOT NULL REFERENCES design_atlas.users(id) ON DELETE CASCADE,
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  category_id text NOT NULL,
  tag_id text NOT NULL,
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,id),
  FOREIGN KEY(owner_id,category_id) REFERENCES design_atlas.user_categories(owner_id,id),
  FOREIGN KEY(owner_id,tag_id) REFERENCES design_atlas.user_tags(owner_id,id)
);
CREATE INDEX user_designs_position_idx ON design_atlas.user_designs(owner_id,position,id);
CREATE INDEX user_designs_category_idx ON design_atlas.user_designs(owner_id,category_id);
CREATE INDEX user_designs_tag_idx ON design_atlas.user_designs(owner_id,tag_id);
