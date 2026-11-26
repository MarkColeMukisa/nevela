-- What Grit writes as it goes, emptied before each run as Nevela's activity log is: the
-- tables only where this version of Grit has them.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('activity_logs', 'user_activities') LOOP
    EXECUTE 'TRUNCATE ' || quote_ident(t);
  END LOOP;
END $$;
