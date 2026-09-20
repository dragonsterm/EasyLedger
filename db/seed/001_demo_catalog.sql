-- Synthetic development/demo data only. Never use this seed for real tenants.
-- ON CONFLICT keeps a repeated demo reset idempotent without touching other
-- businesses or products.

BEGIN;

INSERT INTO businesses (
    id,
    owner_user_id,
    name,
    currency,
    timezone,
    is_demo
) VALUES (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    '[DEMO] EasyLedger Juice Stall',
    'IDR',
    'Asia/Jakarta',
    TRUE
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    currency = EXCLUDED.currency,
    timezone = EXCLUDED.timezone,
    is_demo = TRUE;

INSERT INTO products (
    id,
    business_id,
    name,
    default_unit_price
) VALUES
(
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000001',
    'Orange Juice',
    15000
),
(
    '00000000-0000-4000-8000-000000000012',
    '00000000-0000-4000-8000-000000000001',
    'Mango Juice',
    18000
)
ON CONFLICT (id, business_id) DO UPDATE
SET name = EXCLUDED.name,
    default_unit_price = EXCLUDED.default_unit_price,
    active = TRUE;

COMMIT;
