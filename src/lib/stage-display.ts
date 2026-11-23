import {
  defaultStageConfigs,
  listStageConfigs,
  type StageConfigView,
} from "@/lib/db/repositories/stage-config";

/**
 * 阶段展示的单一读取入口（#66）。
 *
 * 管理员配置的显示名/顺序/启停由此统一透出；配置表为空时回落硬编码默认，
 * 保证迁移未运行或测试环境里展示仍可用。
 * 包含停用阶段：历史商机可能停留在已停用的阶段，详情与卡片仍需显示其名称。
 */
export async function loadStageDisplays(): Promise<StageConfigView[]> {
  const configs = await listStageConfigs(true);
  return configs.length > 0 ? configs : defaultStageConfigs();
}

/** 阶段值 -> 显示名映射，供详情页与飞书卡片展示阶段。 */
export async function loadStageLabelMap(): Promise<Record<string, string>> {
  const displays = await loadStageDisplays();
  return Object.fromEntries(
    displays.map((stage) => [stage.value, stage.label])
  );
}
