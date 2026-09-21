-- EasyLedger Day 22: optimistic versioning for catalog mutations.
-- Products keep their historical identity while each editable snapshot is
-- protected by a monotonically increasing version.

BEGIN;

ALTER TABLE products
    ADD COLUMN version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0);

COMMIT;
