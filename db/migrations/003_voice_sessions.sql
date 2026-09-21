-- EasyLedger Day 23: ephemeral voice sessions for AssemblyAI integration.
-- Stores session token hashes, merchant context, and expiry.
-- Provider secrets are never persisted in the database.

BEGIN;

CREATE TABLE voice_sessions (
    id UUID PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES businesses (id) ON DELETE RESTRICT,
    actor_user_id TEXT NOT NULL CHECK (btrim(actor_user_id) <> ''),
    session_token_hash TEXT NOT NULL UNIQUE,
    provider_session_id TEXT,
    selected_dashboard_id UUID,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, business_id)
);

CREATE INDEX voice_sessions_business_token_idx
    ON voice_sessions (business_id, session_token_hash, expires_at);

COMMIT;
