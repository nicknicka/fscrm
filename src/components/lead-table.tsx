import { LeadStatus } from "@/generated/prisma/enums";
import { NavLink } from "./nav-link";
import { AutoSubmitSelect } from "./auto-submit-select";
import { Badge } from "./ui";
import { leadStatusMeta, LEAD_STATUS_OPTIONS } from "@/lib/lead-status";

/** 一行线索在表格里需要的最小字段集合。 */
export interface LeadRow {
  id: string;
  name: string;
  source: string | null;
  status: string;
  ownerId?: string | null;
  owner?: { name: string } | null;
  /** 转化产物；有值则「查看商机」直达详情，否则退回列表。 */
  convertedOpportunityId?: string | null;
}

/**
 * 线索表格的公共骨架：表头 + 状态徽章 + 状态下拉 + 转化链接。
 *
 * 两处页面共用同一张表，各自只提供「本页需要多出来的那一列」：
 * - /leads 还要管理员在转化时选负责人，以及行内删除；
 * - 商机页的线索视图只读，不需要这些。
 * 所以额外操作通过 `renderActions` 注入，不在这张表里分叉两套布局。
 *
 * 表格本身不负责空状态与分页，由调用方包在外层——它们的文案与链接各不相同。
 */
export function LeadTable({
  leads,
  updateStatusAction,
  convertAction,
  renderActions,
}: {
  leads: LeadRow[];
  /** 更新单个线索状态（绑定 id 的 Server Action）。 */
  updateStatusAction: (leadId: string) => (formData: FormData) => Promise<void>;
  /** 转化为商机（绑定 id 的 Server Action）。 */
  convertAction: (leadId: string) => (formData: FormData) => Promise<void>;
  /** 注入额外操作，如管理员选负责人、删除按钮。 */
  renderActions?: (lead: LeadRow) => React.ReactNode;
}) {
  return (
    <table className="w-full min-w-[720px] text-left text-sm">
      <thead className="bg-paper-sunk text-ink-faint">
        <tr>
          <th className="px-4 py-3 font-medium">线索名称</th>
          <th className="px-4 py-3 font-medium">来源</th>
          <th className="px-4 py-3 font-medium">状态</th>
          <th className="px-4 py-3 font-medium">负责人</th>
          <th className="px-4 py-3 font-medium">更新状态</th>
          <th className="px-4 py-3 font-medium">操作</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {leads.map((lead) => {
          const meta = leadStatusMeta(lead.status);
          const converted = lead.status === LeadStatus.CONVERTED;
          return (
            <tr key={lead.id} className="row-glow group/row">
              <td className="px-4 py-3 font-medium">{lead.name}</td>
              <td className="px-4 py-3 text-ink-soft">{lead.source ?? "—"}</td>
              <td className="px-4 py-3">
                <Badge tone={meta.tone}>{meta.label}</Badge>
              </td>
              <td className="px-4 py-3 text-ink-soft">
                {lead.owner?.name ?? "未分配"}
              </td>
              <td className="px-4 py-3">
                <form action={updateStatusAction(lead.id)}>
                  <AutoSubmitSelect
                    name="status"
                    defaultValue={lead.status}
                    options={LEAD_STATUS_OPTIONS}
                    className="rounded-lg border border-line-strong bg-paper-raised px-2 py-1 text-sm"
                  />
                </form>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {converted ? (
                    /* 转化为商机后直达详情；历史线索没有回写关联时退回列表。 */
                    <NavLink
                      href={
                        lead.convertedOpportunityId
                          ? `/opportunities/${lead.convertedOpportunityId}`
                          : "/opportunities"
                      }
                      className="text-sm text-brass-600 transition-colors duration-[var(--motion-fast)] hover:text-brass-500 hover:underline"
                    >
                      查看商机
                    </NavLink>
                  ) : (
                    <form
                      id={`convert-${lead.id}`}
                      action={convertAction(lead.id)}
                      className="flex items-center gap-2"
                    >
                      <button
                        type="submit"
                        className="min-h-11 rounded-lg bg-brass-50 px-3 py-2 text-sm text-brass-600 hover:bg-brass-100"
                      >
                        转化为商机
                      </button>
                    </form>
                  )}
                  {renderActions?.(lead)}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
