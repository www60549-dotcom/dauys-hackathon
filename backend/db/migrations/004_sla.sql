-- A reply and a final resolution have separate deadlines. Historical records
-- receive the documented 18-hour response policy; reply times are never invented.
ALTER TABLE appeals ADD COLUMN response_due_at timestamptz;
ALTER TABLE appeals DISABLE TRIGGER appeals_version;
UPDATE appeals SET response_due_at=created_at+interval '18 hours';
ALTER TABLE appeals ENABLE TRIGGER appeals_version;
ALTER TABLE appeals ALTER COLUMN response_due_at SET NOT NULL;
ALTER TABLE appeals ALTER COLUMN response_due_at SET DEFAULT (now()+interval '18 hours');
CREATE TABLE appeal_escalations (
 id bigserial PRIMARY KEY,
 appeal_id text NOT NULL REFERENCES appeals(id),
 actor_id text NOT NULL REFERENCES users(id),
 reason text NOT NULL CHECK(reason IN ('first_response','resolution')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX escalation_latest ON appeal_escalations(appeal_id,created_at DESC);
CREATE INDEX comments_response ON comments(appeal_id,created_at);
-- One global revision also refreshes analytics for observers without a personal
-- notification. It contains no appeal content and is transactional.
CREATE TABLE workspace_revision(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), revision bigint NOT NULL DEFAULT 0);
INSERT INTO workspace_revision DEFAULT VALUES;
CREATE FUNCTION advance_workspace_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN UPDATE workspace_revision SET revision=revision+1; RETURN NULL; END;
$$;
CREATE TRIGGER history_revision AFTER INSERT ON history
FOR EACH STATEMENT EXECUTE FUNCTION advance_workspace_revision();
