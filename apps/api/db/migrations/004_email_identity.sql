-- Email is the account identity; usernames are non-unique display names.
ALTER TABLE design_atlas.users DROP CONSTRAINT users_username_key;
ALTER TABLE design_atlas.users DROP CONSTRAINT users_username_check;
ALTER TABLE design_atlas.users ADD CONSTRAINT users_username_check CHECK (length(btrim(username)) BETWEEN 1 AND 32);
-- Keep usernames unambiguous for legacy accounts that have no email.
CREATE UNIQUE INDEX users_legacy_username_unique ON design_atlas.users(username) WHERE email IS NULL;
