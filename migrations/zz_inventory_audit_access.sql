-- Append-only inventory audit and explicit permission assignments.
-- Apply manually to belok_dev after backup; no user is automatically promoted.
CREATE TABLE IF NOT EXISTS inventory_audit_events (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 item_id UUID,
 actor_user_id TEXT,
 action TEXT NOT NULL,
 before_state JSONB,
 after_state JSONB,
 occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS inventory_audit_item_time_idx ON inventory_audit_events(item_id,occurred_at DESC);
CREATE TABLE IF NOT EXISTS inventory_access (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 access_role TEXT NOT NULL CHECK (access_role IN ('SUPERADMIN','MANAGER','STOCK','VIEWER')),
 granted_by TEXT REFERENCES users(id),
 granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE OR REPLACE FUNCTION inventory_audit_item_change() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE uid TEXT;
BEGIN
 uid := NULLIF(current_setting('belok.actor_user_id',true),'');
 INSERT INTO inventory_audit_events(item_id,actor_user_id,action,before_state,after_state)
 VALUES(COALESCE(NEW.id,OLD.id),uid,TG_OP,CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
 CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
 RETURN COALESCE(NEW,OLD);
END $$;
DROP TRIGGER IF EXISTS inventory_item_audit_trigger ON inventory_items;
CREATE TRIGGER inventory_item_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON inventory_items
FOR EACH ROW EXECUTE FUNCTION inventory_audit_item_change();
CREATE OR REPLACE FUNCTION inventory_audit_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Inventory audit is append-only'; END $$;
DROP TRIGGER IF EXISTS inventory_audit_no_update ON inventory_audit_events;
CREATE TRIGGER inventory_audit_no_update BEFORE UPDATE OR DELETE ON inventory_audit_events
FOR EACH ROW EXECUTE FUNCTION inventory_audit_immutable();

-- Record the movement itself, including reason and delta. Existing movement rows are not modified.
CREATE OR REPLACE FUNCTION inventory_audit_movement() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO inventory_audit_events(item_id,actor_user_id,action,before_state,after_state)
 VALUES(NEW.item_id,NULLIF(current_setting('belok.actor_user_id',true),''),'MOVEMENT',NULL,to_jsonb(NEW));
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS inventory_movement_audit_trigger ON inventory_movements;
CREATE TRIGGER inventory_movement_audit_trigger AFTER INSERT ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION inventory_audit_movement();
