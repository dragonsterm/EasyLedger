-- Migration 004: Persistent User Accounts and Authentication Identity
-- Supports merchant login, persistent profile identity, and ties businesses.owner_user_id to verified users.

BEGIN;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE NOT NULL CHECK (btrim(email) <> ''),
    name TEXT NOT NULL CHECK (btrim(name) <> ''),
    role TEXT NOT NULL DEFAULT 'merchant' CHECK (role IN ('merchant', 'admin', 'demo')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default demo user account matching the seeded demo business owner
INSERT INTO users (
    id,
    email,
    name,
    role
) VALUES (
    '00000000-0000-4000-8000-000000000101',
    'demo@easyledger.local',
    'Demo Merchant Owner',
    'demo'
)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    name = EXCLUDED.name,
    role = EXCLUDED.role;

COMMIT;
