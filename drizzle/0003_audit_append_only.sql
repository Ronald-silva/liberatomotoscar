-- Custom SQL migration file, put your code below! --
CREATE FUNCTION reject_vehicle_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'vehicle_audit is append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER vehicle_audit_append_only
BEFORE UPDATE OR DELETE ON vehicle_audit
FOR EACH ROW EXECUTE FUNCTION reject_vehicle_audit_mutation();
