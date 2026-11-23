-- Add optional source follow-up to sales tasks.
-- Safe to re-run: the column and the FK constraint are created only when missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = CURRENT_SCHEMA()
      AND table_name = 'sales_tasks'
      AND column_name = 'followUpId'
  ) THEN
    ALTER TABLE "sales_tasks" ADD COLUMN "followUpId" TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_tasks_followUpId_fkey'
      AND conrelid = 'sales_tasks'::regclass
  ) THEN
    ALTER TABLE "sales_tasks"
      ADD CONSTRAINT "sales_tasks_followUpId_fkey"
      FOREIGN KEY ("followUpId") REFERENCES "follow_ups"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
