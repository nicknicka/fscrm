import { prisma } from "@/lib/db/client";
import { OpportunityStage } from "@/generated/prisma/enums";
import { OPPORTUNITY_STAGES } from "@/lib/opportunity-stages";

/**
 * 销售阶段配置服务（#66）。
 *
 * 阶段值仍是数据库枚举（不可新增值），配置表管理显示名、排序与启停。
 * parseOpportunityStage 仍用枚举全集校验，所以停用阶段的 URL 依旧合法，
 * 只是不在界面展示——避免旧链接失效。
 */

/** 界面展示用的阶段条目。 */
export interface StageConfigView {
  value: OpportunityStage;
  label: string;
  position: number;
  isActive: boolean;
  tone: string;
}

/** 读取阶段配置；includeInactive=false 时只返回启用阶段。 */
export async function listStageConfigs(
  includeInactive = false
): Promise<StageConfigView[]> {
  const rows = await prisma.opportunityStageConfig.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: { position: "asc" },
  });
  return rows.map((row) => ({
    value: row.stage,
    label: row.label,
    position: row.position,
    isActive: row.isActive,
    tone: row.tone,
  }));
}

/** 保存配置（整体覆盖）。只接受枚举内的 stage，非法值丢弃。 */
export async function saveStageConfigs(
  configs: Array<{
    stage: string;
    label: string;
    position: number;
    isActive: boolean;
    tone: string;
  }>
): Promise<void> {
  const allowed = new Set<string>(Object.values(OpportunityStage));
  const valid = configs.filter((c) => allowed.has(c.stage));
  await prisma.$transaction([
    prisma.opportunityStageConfig.deleteMany({}),
    ...valid.map((c) =>
      prisma.opportunityStageConfig.create({
        data: {
          stage: c.stage as OpportunityStage,
          label: c.label.trim() || c.stage,
          position: Number.isFinite(c.position) ? c.position : 999,
          isActive: c.isActive !== false,
          tone: c.tone || "blue",
        },
      })
    ),
  ]);
}

/** 数据库无配置时的兜底（例如迁移未运行的测试环境）：用硬编码默认值。 */
export function defaultStageConfigs(): StageConfigView[] {
  return OPPORTUNITY_STAGES.map((stage, index) => ({
    value: stage.value,
    label: stage.label,
    position: index + 1,
    isActive: true,
    tone: stage.tone,
  }));
}
