ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "cycleStartedAt" TIMESTAMP(3), ADD COLUMN IF NOT EXISTS "cycleClosedAt" TIMESTAMP(3);
CREATE TABLE IF NOT EXISTS "CycleArchive" (
  "id" TEXT PRIMARY KEY, "groupId" TEXT NOT NULL REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "startedAt" TIMESTAMP(3) NOT NULL, "closedAt" TIMESTAMP(3) NOT NULL,
  "closedBy" TEXT NOT NULL, "snapshot" JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS "CycleArchive_groupId_closedAt_idx" ON "CycleArchive"("groupId", "closedAt");

CREATE OR REPLACE FUNCTION "require_open_kikoba_cycle"() RETURNS trigger
LANGUAGE plpgsql AS $func$
DECLARE
  target_group TEXT;
  closed_at TIMESTAMP(3);
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_group := OLD."groupId";
  ELSE
    target_group := NEW."groupId";
  END IF;
  SELECT "cycleClosedAt" INTO closed_at FROM "Group" WHERE id = target_group FOR SHARE;
  IF closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Kikoba cycle is closed' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$func$;

DO $guards$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['GroupMember', 'ShareRecord', 'PapoAccount', 'PapoTopUp', 'Loan', 'FineRecord', 'Transaction', 'GroupExpense', 'MemberTermination', 'RuleChangeLog']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS require_open_cycle ON %I', table_name);
    EXECUTE format('CREATE TRIGGER require_open_cycle BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION "require_open_kikoba_cycle"()', table_name);
  END LOOP;
END;
$guards$;

CREATE OR REPLACE FUNCTION "require_open_kikoba_related_record"() RETURNS trigger
LANGUAGE plpgsql AS $func$
DECLARE
  parent_id TEXT;
  closed_at TIMESTAMP(3);
BEGIN
  IF TG_OP = 'DELETE' THEN
    parent_id := to_jsonb(OLD) ->> TG_ARGV[1];
  ELSE
    parent_id := to_jsonb(NEW) ->> TG_ARGV[1];
  END IF;
  EXECUTE format(
    'SELECT g."cycleClosedAt" FROM "Group" g JOIN %I parent ON parent."groupId" = g.id WHERE parent.id = $1 FOR SHARE OF g',
    TG_ARGV[0]
  ) INTO closed_at USING parent_id;
  IF closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Kikoba cycle is closed' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS require_open_cycle ON "LoanApproval";
CREATE TRIGGER require_open_cycle BEFORE INSERT OR UPDATE OR DELETE ON "LoanApproval"
FOR EACH ROW EXECUTE FUNCTION "require_open_kikoba_related_record"('Loan', 'loanId');
DROP TRIGGER IF EXISTS require_open_cycle ON "LoanAnnouncementAck";
CREATE TRIGGER require_open_cycle BEFORE INSERT OR UPDATE OR DELETE ON "LoanAnnouncementAck"
FOR EACH ROW EXECUTE FUNCTION "require_open_kikoba_related_record"('Loan', 'loanId');
DROP TRIGGER IF EXISTS require_open_cycle ON "TerminationVote";
CREATE TRIGGER require_open_cycle BEFORE INSERT OR UPDATE OR DELETE ON "TerminationVote"
FOR EACH ROW EXECUTE FUNCTION "require_open_kikoba_related_record"('MemberTermination', 'terminationId');
