-- Link a lead to the objects it produced, and let follow-ups hang off a lead.
--
-- Two changes:
--   1. leads.convertedCustomerId / convertedOpportunityId — after «转化为商机» the
--      lead points at the real customer and opportunity, so the UI can jump to the
--      detail page instead of dropping the user back on the list. ON DELETE SET NULL
--      keeps the lead row (and its history) when the downstream object is removed.
--   2. follow_ups.leadId — follow-ups recorded while a lead is being worked can now
--      hang off the lead. Conversion re-points them onto the new opportunity.
--
-- Safe to re-run: every column and constraint is created only when missing.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = CURRENT_SCHEMA()
      AND table_name = 'leads'
      AND column_name = 'convertedCustomerId'
  ) THEN
    ALTER TABLE "leads" ADD COLUMN "convertedCustomerId" TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = CURRENT_SCHEMA()
      AND table_name = 'leads'
      AND column_name = 'convertedOpportunityId'
  ) THEN
    ALTER TABLE "leads" ADD COLUMN "convertedOpportunityId" TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = CURRENT_SCHEMA()
      AND table_name = 'follow_ups'
      AND column_name = 'leadId'
  ) THEN
    ALTER TABLE "follow_ups" ADD COLUMN "leadId" TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leads_convertedCustomerId_fkey'
      AND conrelid = 'leads'::regclass
  ) THEN
    ALTER TABLE "leads"
      ADD CONSTRAINT "leads_convertedCustomerId_fkey"
      FOREIGN KEY ("convertedCustomerId") REFERENCES "customers"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leads_convertedOpportunityId_fkey'
      AND conrelid = 'leads'::regclass
  ) THEN
    ALTER TABLE "leads"
      ADD CONSTRAINT "leads_convertedOpportunityId_fkey"
      FOREIGN KEY ("convertedOpportunityId") REFERENCES "opportunities"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'follow_ups_leadId_fkey'
      AND conrelid = 'follow_ups'::regclass
  ) THEN
    ALTER TABLE "follow_ups"
      ADD CONSTRAINT "follow_ups_leadId_fkey"
      FOREIGN KEY ("leadId") REFERENCES "leads"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill: leads already marked CONVERTED keep no pointer today. Best-effort match
-- on the customer created from the lead (same name + owner) where exactly one
-- candidate exists, so «查看商机» works for historical rows too. Ambiguous names are
-- left NULL on purpose — guessing would wire a lead to the wrong opportunity.
UPDATE "leads" l
SET "convertedCustomerId" = c."id"
FROM "customers" c
WHERE l."status" = 'CONVERTED'
  AND l."convertedCustomerId" IS NULL
  AND c."name" = l."name"
  AND (
    (l."ownerId" IS NULL AND c."ownerId" IS NULL)
    OR c."ownerId" = l."ownerId"
  )
  AND (
    SELECT count(*)
    FROM "customers" c2
    WHERE c2."name" = l."name"
      AND (
        (l."ownerId" IS NULL AND c2."ownerId" IS NULL)
        OR c2."ownerId" = l."ownerId"
      )
  ) = 1;

UPDATE "leads" l
SET "convertedOpportunityId" = o."id"
FROM "opportunities" o
WHERE l."status" = 'CONVERTED'
  AND l."convertedOpportunityId" IS NULL
  AND o."customerId" = l."convertedCustomerId"
  AND o."name" = l."name"
  AND (
    SELECT count(*)
    FROM "opportunities" o2
    WHERE o2."customerId" = l."convertedCustomerId"
      AND o2."name" = l."name"
  ) = 1;

-- Supporting index for the backfill / detail lookups.
CREATE INDEX IF NOT EXISTS "follow_ups_leadId_idx" ON "follow_ups"("leadId");
