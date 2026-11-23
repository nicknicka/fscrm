-- CreateTable
CREATE TABLE "reconciliations" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "receivedTotal" DOUBLE PRECISION NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL,
    "confirmedBy" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reconciliations_orderId_createdAt_idx" ON "reconciliations"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

