-- Demonstrate CREATE, ALTER, and DROP using only a session-local temporary table.
-- The final ROLLBACK undoes every statement in this transaction.

BEGIN;

-- Create a uniquely named temporary table with a primary key, NOT NULL field,
-- and CHECK constraint. TEMP keeps the table out of the persistent schema.
CREATE TEMP TABLE IF NOT EXISTS campusconnect_level3_ddl_demo_20261120 (
    demo_id integer CONSTRAINT campusconnect_level3_ddl_demo_pk PRIMARY KEY,
    label text NOT NULL,
    score integer NOT NULL
        CONSTRAINT campusconnect_level3_ddl_demo_score_check CHECK (score >= 0)
);

-- Add a demonstration column to the temporary table.
ALTER TABLE pg_temp.campusconnect_level3_ddl_demo_20261120
    ADD COLUMN IF NOT EXISTS notes text;

-- Create a demonstration index on the temporary table.
CREATE INDEX IF NOT EXISTS campusconnect_level3_ddl_demo_label_idx
    ON pg_temp.campusconnect_level3_ddl_demo_20261120 (label);

-- Drop only the temporary demonstration table; do not use CASCADE.
DROP TABLE IF EXISTS pg_temp.campusconnect_level3_ddl_demo_20261120;

-- Undo the CREATE, ALTER, index, and DROP so no demonstration object remains.
ROLLBACK;
