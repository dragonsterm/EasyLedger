-- Persistent credentials and revocable browser sessions.
-- New accounts require a password; the seeded demo account remains demo-login only.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

UPDATE users
   SET username = CASE
     WHEN id = '00000000-0000-4000-8000-000000000101' THEN 'demo'
     ELSE 'merchant_' || replace(id::text, '-', '')
   END
 WHERE username IS NULL OR btrim(username) = '';

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique
    ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
    ON users (lower(email));

ALTER TABLE users
    ALTER COLUMN username SET NOT NULL,
    ADD CONSTRAINT users_username_not_blank CHECK (btrim(username) <> ''),
    ADD CONSTRAINT users_password_hash_shape CHECK (
      password_hash IS NULL OR password_hash ~ '^scrypt\$[0-9]+\$[0-9]+\$[0-9]+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$'
    );

CREATE TABLE auth_sessions (
    token_hash CHAR(64) PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    CHECK (expires_at > created_at)
);

CREATE INDEX auth_sessions_user_expiry_idx ON auth_sessions (user_id, expires_at);

COMMIT;
