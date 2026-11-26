import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";
import {
  defaultStageConfigs,
  listStageConfigs,
} from "@/lib/db/repositories/stage-config";
import { saveStageConfigsAction } from "./actions";

/** 销售阶段配置页：管理员管理显示名、顺序与启停（阶段值本身是枚举，不可新增）。 */
export default async function StageSettingsPage() {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") notFound();

  let configs;
  try {
    configs = await listStageConfigs(true);
  } catch {
    // 迁移未运行的极端情况：用默认配置展示，不让页面整体崩。
    configs = defaultStageConfigs();
  }

  const toneOptions = [
    { value: "blue", label: "蓝" },
    { value: "amber", label: "橙" },
    { value: "green", label: "绿" },
    { value: "zinc", label: "灰" },
  ];

  return (
    <div>
      <Link href="/settings" className="text-sm text-brass-600 hover:underline">
        ← 返回设置
      </Link>
      <div className="mt-4">
        <PageHeader
          title="销售阶段配置"
          description="调整阶段显示名、顺序与启停；阶段值由数据模型固定，不可新增"
        />
      </div>

      <form
        action={saveStageConfigsAction}
        className="rounded-xl border border-line bg-paper-raised p-6"
      >
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs text-ink-faint">
            <tr>
              <th className="py-3 font-medium">阶段值</th>
              <th className="py-3 font-medium">显示名</th>
              <th className="py-3 font-medium">顺序</th>
              <th className="py-3 font-medium">色调</th>
              <th className="py-3 font-medium">启用</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {configs.map((config) => (
              <tr key={config.value} className="row-glow">
                {/* 按顺序输入排序：所有行都以隐藏 stage 提交，服务端按渲染序赋 position */}
                <input type="hidden" name="stage" value={config.value} />
                <td className="py-3 font-mono text-xs text-ink-faint">
                  {config.value}
                </td>
                <td className="py-3">
                  <input
                    name={`label_${config.value}`}
                    defaultValue={config.label}
                    required
                    className="rounded-lg border border-line-strong px-3 py-1.5"
                  />
                </td>
                <td className="py-3">
                  <input
                    name={`position_${config.value}`}
                    type="number"
                    min="0"
                    defaultValue={config.position}
                    className="w-20 rounded-lg border border-line-strong px-3 py-1.5"
                  />
                </td>
                <td className="py-3">
                  <select
                    name={`tone_${config.value}`}
                    defaultValue={config.tone}
                    className="rounded-lg border border-line-strong px-3 py-1.5"
                  >
                    {toneOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-3">
                  <input
                    type="checkbox"
                    name={`active_${config.value}`}
                    defaultChecked={config.isActive}
                    className="rounded border-line-strong"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 border-t border-line pt-5 text-xs text-ink-faint">
          顺序数字越小越靠前；停用阶段不在新建表单、列表筛选与漏斗中展示，历史数据不受影响。
        </div>
        <button type="submit" className="mt-4 btn btn-primary">
          保存配置
        </button>
      </form>
    </div>
  );
}
