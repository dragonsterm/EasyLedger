-- Run after db/migrations/001_initial_schema.sql and db/seed/001_demo_catalog.sql.
-- Every deliberate failure is caught; any missing constraint aborts this script.

BEGIN;

DO $$
BEGIN
    IF (SELECT count(*) FROM products
        WHERE business_id = '00000000-0000-4000-8000-000000000001') <> 2 THEN
        RAISE EXCEPTION 'demo seed must contain exactly two products';
    END IF;
END;
$$;

INSERT INTO businesses (id, owner_user_id, name, currency)
VALUES
    ('10000000-0000-4000-8000-000000000001', 'test-user-usd', 'USD Shop', 'USD'),
    ('20000000-0000-4000-8000-000000000001', 'test-user-idr', 'IDR Shop', 'IDR');

INSERT INTO products (id, business_id, name, default_unit_price)
VALUES
    ('10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000001', 'Coffee', 1250),
    ('20000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000001', 'Coffee', 15000);

DO $$
BEGIN
    BEGIN
        INSERT INTO products (id, business_id, name)
        VALUES ('10000000-0000-4000-8000-000000000012',
                '10000000-0000-4000-8000-000000000001', '  COFFEE  ');
        RAISE EXCEPTION 'duplicate normalized product was accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO sales (id, business_id, product_id, quantity, unit_price, sale_date)
        VALUES ('10000000-0000-4000-8000-000000000021',
                '10000000-0000-4000-8000-000000000001',
                '20000000-0000-4000-8000-000000000011', 1, 100, CURRENT_DATE);
        RAISE EXCEPTION 'cross-tenant product reference was accepted';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO sales (id, business_id, product_id, quantity, unit_price, sale_date)
        VALUES ('10000000-0000-4000-8000-000000000022',
                '10000000-0000-4000-8000-000000000001',
                '10000000-0000-4000-8000-000000000011', 0, 100, CURRENT_DATE);
        RAISE EXCEPTION 'zero quantity was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO sales (id, business_id, product_id, quantity, unit_price, sale_date)
        VALUES ('10000000-0000-4000-8000-000000000023',
                '10000000-0000-4000-8000-000000000001',
                '10000000-0000-4000-8000-000000000011', 1, -1, CURRENT_DATE);
        RAISE EXCEPTION 'negative price was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO day_coverages (business_id, local_date, state)
        VALUES ('10000000-0000-4000-8000-000000000001', CURRENT_DATE, 'unknown');
        RAISE EXCEPTION 'invalid day coverage state was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        UPDATE businesses SET currency = 'IDR'
        WHERE id = '10000000-0000-4000-8000-000000000001';
        RAISE EXCEPTION 'business currency change was accepted';
    EXCEPTION WHEN SQLSTATE '22000' THEN NULL;
    END;
END;
$$;

-- NULL is unknown; zero is a known free sale. Both must remain distinct.
INSERT INTO sales (id, business_id, product_id, quantity, unit_price, sale_date)
VALUES
    ('10000000-0000-4000-8000-000000000024',
     '10000000-0000-4000-8000-000000000001',
     '10000000-0000-4000-8000-000000000011', 1, NULL, CURRENT_DATE),
    ('10000000-0000-4000-8000-000000000025',
     '10000000-0000-4000-8000-000000000001',
     '10000000-0000-4000-8000-000000000011', 1, 0, CURRENT_DATE);

INSERT INTO operations (
    id, business_id, idempotency_key, payload_hash, status, result_receipt, actor_user_id, completed_at
) VALUES (
    '10000000-0000-4000-8000-000000000031',
    '10000000-0000-4000-8000-000000000001',
    'day20-append-only', 'test-hash', 'committed', '{}'::jsonb, 'test-user-usd', now()
);

INSERT INTO sale_revisions (
    id, business_id, sale_id, operation_id, before_values, after_values, actor_user_id, reason
) VALUES (
    '10000000-0000-4000-8000-000000000041',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000025',
    '10000000-0000-4000-8000-000000000031',
    '{}'::jsonb, '{"unit_price": 0}'::jsonb, 'test-user-usd', 'verify append-only audit'
);

DO $$
BEGIN
    IF (SELECT count(*) FROM sales WHERE unit_price IS NULL) <> 1
       OR (SELECT count(*) FROM sales WHERE unit_price = 0) <> 1 THEN
        RAISE EXCEPTION 'unknown and zero price semantics were not preserved';
    END IF;

    BEGIN
        UPDATE sale_revisions SET reason = 'tampered'
        WHERE id = '10000000-0000-4000-8000-000000000041';
        RAISE EXCEPTION 'append-only revision update was accepted';
    EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
    END;
END;
$$;

ROLLBACK;
