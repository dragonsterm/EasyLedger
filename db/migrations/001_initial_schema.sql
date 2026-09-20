-- EasyLedger Day 20 foundation: tenant-owned schema and exact money storage.
-- Monetary values are integer minor units: whole rupiah for IDR and cents for
-- USD. Currency conversion and mixed-currency ledgers are out of scope.
-- Apply this migration once, in order. Conditional creation is intentionally
-- avoided so a drifted migration fails loudly and is reviewed.

BEGIN;

CREATE TABLE businesses (
    id UUID PRIMARY KEY,
    owner_user_id TEXT NOT NULL CHECK (btrim(owner_user_id) <> ''),
    name TEXT NOT NULL CHECK (btrim(name) <> ''),
    currency TEXT NOT NULL DEFAULT 'IDR' CHECK (currency IN ('IDR', 'USD')),
    timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta' CHECK (timezone = 'Asia/Jakarta'),
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    ledger_revision BIGINT NOT NULL DEFAULT 0 CHECK (ledger_revision >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
    id UUID PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES businesses (id) ON DELETE RESTRICT,
    name TEXT NOT NULL CHECK (btrim(name) <> ''),
    name_normalized TEXT GENERATED ALWAYS AS (
        lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
    ) STORED,
    aliases TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    active BOOLEAN NOT NULL DEFAULT TRUE,
    default_unit_price BIGINT CHECK (
        default_unit_price IS NULL
        OR (default_unit_price >= 0 AND default_unit_price <= 1000000000)
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, business_id),
    UNIQUE (business_id, name_normalized)
);

CREATE TABLE operations (
    id UUID PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES businesses (id) ON DELETE RESTRICT,
    idempotency_key TEXT NOT NULL CHECK (btrim(idempotency_key) <> ''),
    payload_hash TEXT NOT NULL CHECK (btrim(payload_hash) <> ''),
    status TEXT NOT NULL CHECK (status IN ('pending', 'committed', 'failed')),
    result_receipt JSONB,
    actor_user_id TEXT NOT NULL CHECK (btrim(actor_user_id) <> ''),
    undo_of_operation_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    UNIQUE (id, business_id),
    UNIQUE (business_id, idempotency_key),
    CHECK (status <> 'committed' OR result_receipt IS NOT NULL),
    CHECK (status = 'committed' OR completed_at IS NULL OR completed_at >= created_at),
    FOREIGN KEY (undo_of_operation_id, business_id)
        REFERENCES operations (id, business_id) ON DELETE RESTRICT
);

CREATE TABLE sales (
    id UUID PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES businesses (id) ON DELETE RESTRICT,
    product_id UUID NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 1000000),
    unit_price BIGINT CHECK (
        unit_price IS NULL OR (unit_price >= 0 AND unit_price <= 1000000000)
    ),
    sale_date DATE NOT NULL,
    version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
    voided BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, business_id),
    FOREIGN KEY (product_id, business_id)
        REFERENCES products (id, business_id) ON DELETE RESTRICT
);

CREATE TABLE sale_revisions (
    id UUID PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES businesses (id) ON DELETE RESTRICT,
    sale_id UUID NOT NULL,
    operation_id UUID NOT NULL,
    before_values JSONB NOT NULL CHECK (jsonb_typeof(before_values) = 'object'),
    after_values JSONB NOT NULL CHECK (jsonb_typeof(after_values) = 'object'),
    actor_user_id TEXT NOT NULL CHECK (btrim(actor_user_id) <> ''),
    reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, business_id),
    FOREIGN KEY (sale_id, business_id)
        REFERENCES sales (id, business_id) ON DELETE RESTRICT,
    FOREIGN KEY (operation_id, business_id)
        REFERENCES operations (id, business_id) ON DELETE RESTRICT
);

CREATE TABLE day_coverages (
    business_id UUID NOT NULL REFERENCES businesses (id) ON DELETE RESTRICT,
    local_date DATE NOT NULL,
    state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'complete')),
    version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (business_id, local_date)
);

CREATE TABLE coverage_revisions (
    id UUID PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES businesses (id) ON DELETE RESTRICT,
    local_date DATE NOT NULL,
    operation_id UUID NOT NULL,
    before_state TEXT NOT NULL CHECK (before_state IN ('open', 'complete')),
    after_state TEXT NOT NULL CHECK (after_state IN ('open', 'complete')),
    actor_user_id TEXT NOT NULL CHECK (btrim(actor_user_id) <> ''),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, business_id),
    FOREIGN KEY (business_id, local_date)
        REFERENCES day_coverages (business_id, local_date) ON DELETE RESTRICT,
    FOREIGN KEY (operation_id, business_id)
        REFERENCES operations (id, business_id) ON DELETE RESTRICT
);

CREATE TABLE proposals (
    id UUID PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES businesses (id) ON DELETE RESTRICT,
    session_id UUID,
    normalized_payload JSONB NOT NULL CHECK (jsonb_typeof(normalized_payload) = 'object'),
    payload_hash TEXT NOT NULL CHECK (btrim(payload_hash) <> ''),
    status TEXT NOT NULL CHECK (
        status IN ('awaiting_confirmation', 'committed', 'cancelled', 'expired')
    ),
    expires_at TIMESTAMPTZ NOT NULL,
    base_ledger_revision BIGINT NOT NULL CHECK (base_ledger_revision >= 0),
    confirmation_token_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, business_id)
);

CREATE TABLE dashboards (
    id UUID PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES businesses (id) ON DELETE RESTRICT,
    name TEXT NOT NULL CHECK (btrim(name) <> ''),
    schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version > 0),
    version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
    widgets JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (
        jsonb_typeof(widgets) = 'array' AND jsonb_array_length(widgets) <= 20
    ),
    layout JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(layout) = 'array'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, business_id),
    UNIQUE (business_id, name)
);

CREATE INDEX sales_business_date_idx ON sales (business_id, sale_date);
CREATE INDEX sales_business_product_date_idx ON sales (business_id, product_id, sale_date);
CREATE INDEX sale_revisions_sale_created_idx ON sale_revisions (business_id, sale_id, created_at);
CREATE INDEX coverage_revisions_day_created_idx
    ON coverage_revisions (business_id, local_date, created_at);
CREATE INDEX operations_business_created_idx ON operations (business_id, created_at);
CREATE INDEX proposals_business_status_idx ON proposals (business_id, status, expires_at);
CREATE INDEX dashboards_business_version_idx ON dashboards (business_id, version);

CREATE FUNCTION prevent_revision_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'ledger revisions are append-only' USING ERRCODE = '55000';
END;
$$;

CREATE FUNCTION prevent_business_currency_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.currency <> OLD.currency THEN
        RAISE EXCEPTION 'business currency is immutable after creation' USING ERRCODE = '22000';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER businesses_currency_immutable
    BEFORE UPDATE OF currency ON businesses
    FOR EACH ROW EXECUTE FUNCTION prevent_business_currency_change();

CREATE TRIGGER sale_revisions_append_only
    BEFORE UPDATE OR DELETE ON sale_revisions
    FOR EACH ROW EXECUTE FUNCTION prevent_revision_mutation();

CREATE TRIGGER coverage_revisions_append_only
    BEFORE UPDATE OR DELETE ON coverage_revisions
    FOR EACH ROW EXECUTE FUNCTION prevent_revision_mutation();

COMMIT;
