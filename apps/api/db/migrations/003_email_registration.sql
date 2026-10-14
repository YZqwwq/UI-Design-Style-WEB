-- Existing accounts may continue logging in without an email; new registrations verify one.
ALTER TABLE design_atlas.users ADD COLUMN email text;
ALTER TABLE design_atlas.users ADD COLUMN email_verified_at timestamptz;
CREATE UNIQUE INDEX users_email_unique ON design_atlas.users(lower(email)) WHERE email IS NOT NULL;
CREATE TABLE design_atlas.registration_codes (
  email text PRIMARY KEY,
  id uuid NOT NULL,
  code_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0,
  sent_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  send_count integer NOT NULL DEFAULT 1
);
CREATE INDEX registration_codes_expiry ON design_atlas.registration_codes(expires_at);
