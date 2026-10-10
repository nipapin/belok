-- A position may be skipped by the customer (e.g. sauce).
-- The existing check was created by zz_combos_mvp.sql.
ALTER TABLE combo_groups DROP CONSTRAINT IF EXISTS "combo_groups_minSelect_check";
ALTER TABLE combo_groups ADD CONSTRAINT "combo_groups_minSelect_check" CHECK ("minSelect" BETWEEN 0 AND 10);
