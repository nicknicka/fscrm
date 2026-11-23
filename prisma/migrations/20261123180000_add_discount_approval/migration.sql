-- CreateEnum
CREATE TYPE "DiscountApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "discount_approvals" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "discountRate" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "status" "DiscountApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "originalAmount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discount_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "discount_approvals_opportunityId_createdAt_idx" ON "discount_approvals"("opportunityId", "createdAt");

-- AddForeignKey
ALTER TABLE "discount_approvals" ADD CONSTRAINT "discount_approvals_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

