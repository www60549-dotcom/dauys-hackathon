ALTER TABLE appeals ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);

ALTER TABLE history
  ADD COLUMN event_type text NOT NULL DEFAULT 'legacy',
  ADD COLUMN from_status text,
  ADD COLUMN to_status text,
  ADD COLUMN appeal_version integer,
  ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT history_from_status CHECK (from_status IS NULL OR from_status IN ('new','review','progress','waiting','resolved','closed','rejected')),
  ADD CONSTRAINT history_to_status CHECK (to_status IS NULL OR to_status IN ('new','review','progress','waiting','resolved','closed','rejected'));

CREATE INDEX history_status_events ON history(to_status,created_at,appeal_id) WHERE to_status IS NOT NULL;

-- The database increments the revision for every writer, including business modules.
-- Existing records and legacy history are deliberately not reconstructed.
CREATE FUNCTION bump_appeal_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER appeals_version BEFORE UPDATE ON appeals
FOR EACH ROW EXECUTE FUNCTION bump_appeal_version();
