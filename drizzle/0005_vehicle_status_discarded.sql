ALTER TABLE vehicles DROP CONSTRAINT vehicle_status_valid;--> statement-breakpoint
ALTER TABLE vehicles ADD CONSTRAINT vehicle_status_valid
  CHECK (status IN ('draft', 'published', 'reserved', 'sold', 'archived', 'discarded'));
