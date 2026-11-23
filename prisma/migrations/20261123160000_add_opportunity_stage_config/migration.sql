-- CreateTable
CREATE TABLE "opportunity_stage_configs" (
    "stage" "OpportunityStage" NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tone" TEXT NOT NULL DEFAULT 'blue',

    CONSTRAINT "opportunity_stage_configs_pkey" PRIMARY KEY ("stage")
);


-- Seed：把现有 6 个硬编码阶段写入配置（与 opportunity-stages.ts 默认值一致）
INSERT INTO "opportunity_stage_configs" ("stage", "label", "position", "isActive", "tone") VALUES
  ('CONTACT', '初步接触', 1, true, 'blue'),
  ('NEED_CONFIRM', '需求确认', 2, true, 'blue'),
  ('QUOTE', '报价', 3, true, 'amber'),
  ('NEGOTIATE', '谈判', 4, true, 'blue'),
  ('WON', '赢单', 5, true, 'green'),
  ('LOST', '输单', 6, true, 'zinc');
