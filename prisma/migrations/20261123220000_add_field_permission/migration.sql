-- CreateTable
CREATE TABLE "field_permissions" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "entity" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "field_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "field_permissions_role_entity_field_key" ON "field_permissions"("role", "entity", "field");


-- Seed：默认负责人可见客户敏感字段（保持现有行为，管理员可在界面收紧）
INSERT INTO "field_permissions" ("id", "role", "entity", "field", "visible") VALUES
  (gen_random_uuid(), 'OWNER', 'Customer', 'phone', true),
  (gen_random_uuid(), 'OWNER', 'Customer', 'email', true),
  (gen_random_uuid(), 'OWNER', 'Customer', 'address', true);
