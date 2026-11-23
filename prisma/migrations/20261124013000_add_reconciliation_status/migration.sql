-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('CONFIRMED', 'VOID');

-- AlterTable
ALTER TABLE "reconciliations" ADD COLUMN "status" "ReconciliationStatus" NOT NULL DEFAULT 'CONFIRMED';
