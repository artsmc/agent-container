-- ==========================================================================
-- Short ID Sequences and Trigger Functions
-- ==========================================================================
-- These triggers auto-generate and protect immutable short IDs on the tasks
-- and agendas tables. They MUST be applied after the tables and sequences
-- are created. Drizzle does not support triggers natively, so this raw SQL
-- is applied via the migration runner.
--
-- Sequences:
--   tsk_short_id_seq  -> TSK-0001, TSK-0002, ... TSK-9999, TSK-10000, ...
--   agd_short_id_seq  -> AGD-0001, AGD-0002, ... AGD-9999, AGD-10000, ...
--
-- The LPAD with width 4 ensures at least 3+ digits (zero-padded to 4).
-- Once the sequence exceeds 9999, numbers grow naturally (TSK-10000, etc.).
-- ==========================================================================

-- ---------------------------------------------------------------------------
-- Sequences
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS tsk_short_id_seq START WITH 1 INCREMENT BY 1 NO MAXVALUE;
CREATE SEQUENCE IF NOT EXISTS agd_short_id_seq START WITH 1 INCREMENT BY 1 NO MAXVALUE;

-- ---------------------------------------------------------------------------
-- Task Short ID: Auto-generation on INSERT
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION generate_task_short_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.short_id := 'TSK-' || LPAD(nextval('tsk_short_id_seq')::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tasks_short_id_insert
  BEFORE INSERT ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION generate_task_short_id();

-- ---------------------------------------------------------------------------
-- Task Short ID: Immutability guard on UPDATE
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION guard_task_short_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.short_id <> OLD.short_id THEN
    RAISE EXCEPTION 'short_id is immutable and cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tasks_short_id_update
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  WHEN (NEW.short_id IS DISTINCT FROM OLD.short_id)
  EXECUTE FUNCTION guard_task_short_id();

-- ---------------------------------------------------------------------------
-- Agenda Short ID: Auto-generation on INSERT
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION generate_agenda_short_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.short_id := 'AGD-' || LPAD(nextval('agd_short_id_seq')::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agendas_short_id_insert
  BEFORE INSERT ON agendas
  FOR EACH ROW
  EXECUTE FUNCTION generate_agenda_short_id();

-- ---------------------------------------------------------------------------
-- Agenda Short ID: Immutability guard on UPDATE
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION guard_agenda_short_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.short_id <> OLD.short_id THEN
    RAISE EXCEPTION 'short_id is immutable and cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agendas_short_id_update
  BEFORE UPDATE ON agendas
  FOR EACH ROW
  WHEN (NEW.short_id IS DISTINCT FROM OLD.short_id)
  EXECUTE FUNCTION guard_agenda_short_id();
