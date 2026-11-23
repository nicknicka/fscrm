-- CreateEnum
CREATE TYPE "SalesTaskType" AS ENUM ('TASK', 'SCHEDULE');

-- CreateEnum
CREATE TYPE "SalesTaskStatus" AS ENUM ('OPEN', 'DONE');

-- CreateTable
CREATE TABLE "sales_tasks" (
    "id" TEXT NOT NULL,
    "type" "SalesTaskType" NOT NULL DEFAULT 'TASK',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "SalesTaskStatus" NOT NULL DEFAULT 'OPEN',
    "ownerId" TEXT NOT NULL,
    "customerId" TEXT,
    "opportunityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_tasks_ownerId_dueAt_idx" ON "sales_tasks"("ownerId", "dueAt");

-- AddForeignKey
ALTER TABLE "sales_tasks" ADD CONSTRAINT "sales_tasks_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_tasks" ADD CONSTRAINT "sales_tasks_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_tasks" ADD CONSTRAINT "sales_tasks_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

