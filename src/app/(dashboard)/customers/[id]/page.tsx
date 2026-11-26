import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PageHeader, StatusDot } from "@/components/ui";
import { requireCurrentUser } from "@/lib/auth/session";
import { accessScopeFor } from "@/lib/auth/scope";
import { getCustomer } from "@/lib/db/repositories/customer";
import { loadStageLabelMap } from "@/lib/stage-display";
import {
  FollowUpMode,
  CustomerLifecycle,
  CustomerLevel,
} from "@/generated/prisma/enums";
import { customerLifecycleLabel } from "@/lib/customer-lifecycle";
import {
  CUSTOMER_FIELD_DEFINITIONS,
  normalizeCustomFields,
} from "@/lib/custom-fields";
import { saveCustomerCustomFieldsAction } from "./custom-fields-actions";
import { ContactsManager } from "./contacts/contacts-manager";
import { ChatBindingManager } from "./chat-binding-manager";
import { CustomerDetailForm } from "./customer-detail-form";
import { updateCustomerLifecycleAction } from "../lifecycle-actions";
import { listAssignableUsers } from "@/lib/db/repositories/user";
import {
  createCustomerFollowUpAction,
  deleteCustomerFollowUpAction,
} from "../actions";
import { DateTimeField } from "@/components/datetime-field";

/* 这些页面读取会话与数据库，属于请求时数据，无法静态预渲染。 */
export const instant = false;

const followUpModeLabel: Record<string, string> = {
  [FollowUpMode.CALL]: "电话",
  [FollowUpMode.MEETING]: "面谈",
  [FollowUpMode.EMAIL]: "邮件",
  [FollowUpMode.IM]: "即时消息",
  [FollowUpMode.OTHER]: "其他",
};

/** 客户等级的展示配置：等级在头部用色点和徽章表达，不用大色块。 */
const levelDisplay: Record<
  CustomerLevel,
  { label: string; badge: "amber" | "blue" | "zinc" }
> = {
  [CustomerLevel.HIGH]: { label: "高价值", badge: "amber" },
  [CustomerLevel.MEDIUM]: { label: "中价值", badge: "blue" },
  [CustomerLevel.LOW]: { label: "低价值", badge: "zinc" },
};

/** 生命周期在头部状态带上用色点表达：绿色健康、金色进行、灰色流失。 */
const lifecycleTone: Record<
  CustomerLifecycle,
  { tone: "ok" | "info" | "warn" | "danger"; label: string }
> = {
  [CustomerLifecycle.LEAD]: { tone: "warn", label: "线索" },
  [CustomerLifecycle.WON]: { tone: "ok", label: "成交" },
  [CustomerLifecycle.RETAINED]: { tone: "info", label: "留存" },
  [CustomerLifecycle.CHURNED]: { tone: "danger", label: "流失" },
};

/**
 * 客户详情页。
 *
 * 版式：头部是状态带（等级徽章 + 生命周期色点 + 负责人），下面左列
 * 「基本信息 + 操作」、右列「联系人 / 群绑定 / 商机 / 跟进时间线」。
 * 跟进记录不用表格，用时间线——左侧竖线串起每次触点，读起来是
 * 这个客户的关系史，不是一张流水账。
 */
export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const createFollowUp = createCustomerFollowUpAction.bind(null, id);
  const currentUser = await requireCurrentUser();
  const customer = await getCustomer(id, accessScopeFor(currentUser));
  if (!customer) {
    notFound();
  }
  const customFields = normalizeCustomFields(customer.customFields);
  const stageLabel = await loadStageLabelMap();
  const users =
    currentUser.role === "ADMIN"
      ? (await listAssignableUsers(currentUser)).map((user) => ({
          id: user.id,
          name: user.name,
        }))
      : [];

  const level = levelDisplay[customer.level];
  const lifecycle = lifecycleTone[customer.lifecycle];

  return (
    <div>
      <Link
        href="/customers"
        className="text-[13px] font-medium text-brass-600 transition-colors hover:text-brass-500"
      >
        ← 返回客户列表
      </Link>

      <div className="mt-4" data-enter="rise">
        <PageHeader
          title={customer.name}
          description={customer.industry ?? "客户详情"}
          action={
            <div className="flex items-center gap-2">
              <Badge tone={level.badge}>{level.label}</Badge>
              <Badge tone="default">
                <StatusDot tone={lifecycle.tone} />
                {lifecycle.label}
              </Badge>
            </div>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 基本信息：编辑式定义列表，字段值用 tnum 对齐 */}
        <section className="card p-6" data-enter="fade">
          <h2 className="mb-5 text-[15px] font-semibold tracking-tight text-ink">
            基本信息
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 text-sm">
            <Info label="客户等级" value={level.label} />
            <Info
              label="客户生命周期"
              value={customerLifecycleLabel[customer.lifecycle]}
            />
            <Info label="负责人" value={customer.owner?.name ?? "未分配"} />
            <Info label="电话" value={customer.phone ?? "—"} mono />
            <Info label="邮箱" value={customer.email ?? "—"} mono />
            <Info label="地址" value={customer.address ?? "—"} />
            <Info
              label="创建时间"
              value={customer.createdAt.toLocaleDateString("zh-CN")}
              mono
            />
          </dl>
          {customer.remark && (
            <div className="mt-5 border-t border-line pt-4 text-sm">
              <div className="mb-1 text-xs font-medium uppercase tracking-wider text-ink-faint">
                备注
              </div>
              <div className="leading-relaxed text-ink-soft">
                {customer.remark}
              </div>
            </div>
          )}
          <form
            action={saveCustomerCustomFieldsAction.bind(null, customer.id)}
            className="mt-5 border-t border-line pt-4"
          >
            <h3 className="mb-3 text-[13px] font-semibold text-ink">
              自定义字段
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {CUSTOMER_FIELD_DEFINITIONS.map((def) => (
                <label key={def.key} className="text-xs text-ink-soft">
                  {def.label}
                  <input
                    name={`cf_${def.key}`}
                    defaultValue={customFields[def.key] ?? ""}
                    className="mt-1 w-full rounded-lg border border-line-strong bg-paper-raised px-3 py-1.5 text-sm outline-none transition-colors focus:border-brass-500"
                  />
                </label>
              ))}
            </div>
            <button
              type="submit"
              className="mt-3 min-h-11 rounded-lg border border-line-strong px-3 py-2.5 text-sm text-ink transition-colors hover:bg-paper-sunk"
            >
              保存自定义字段
            </button>
          </form>
          <CustomerDetailForm
            customerId={customer.id}
            level={customer.level}
            industry={customer.industry}
            phone={customer.phone}
            email={customer.email}
            address={customer.address}
            remark={customer.remark}
            ownerId={customer.ownerId}
            canReassignOwner={currentUser.role === "ADMIN"}
            users={users}
          />
          {currentUser.role === "ADMIN" && (
            <form
              action={updateCustomerLifecycleAction.bind(null, customer.id)}
              className="mt-5 border-t border-line pt-4"
            >
              <h3 className="mb-3 text-[13px] font-semibold text-ink">
                调整生命周期
              </h3>
              <div className="flex items-center gap-2">
                <select
                  name="lifecycle"
                  defaultValue={customer.lifecycle}
                  className="rounded-lg border border-line-strong bg-paper-raised px-3 py-2 text-sm outline-none transition-colors focus:border-brass-500"
                >
                  {Object.values(CustomerLifecycle).map((stage) => (
                    <option key={stage} value={stage}>
                      {customerLifecycleLabel[stage]}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="min-h-11 rounded-lg bg-ink-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink-700"
                >
                  保存生命周期
                </button>
              </div>
            </form>
          )}
        </section>

        {/* 联系人：新增/编辑/删除入口与表单 */}
        <ContactsManager
          customerId={customer.id}
          contacts={customer.contacts.map((contact) => ({
            id: contact.id,
            customerId: contact.customerId,
            name: contact.name,
            position: contact.position,
            phone: contact.phone,
            email: contact.email,
            remark: contact.remark,
          }))}
        />

        {/* 飞书群绑定 */}
        <ChatBindingManager
          customerId={customer.id}
          bindings={(customer.chatBindings ?? []).map((binding) => ({
            chatId: binding.chatId,
            boundByName:
              binding.boundByUserId === currentUser.id
                ? currentUser.name
                : null,
            createdAt: binding.createdAt.toLocaleDateString("zh-CN"),
          }))}
        />

        {/* 商机：阶段用进度点表达，不只贴个徽章 */}
        <section className="card p-6" data-enter="fade">
          <h2 className="mb-4 text-[15px] font-semibold tracking-tight text-ink">
            商机
            <span className="tnum ml-1.5 text-sm font-normal text-ink-faint">
              {customer.opportunities.length}
            </span>
          </h2>
          {customer.opportunities.length === 0 ? (
            <p className="text-sm text-ink-faint">暂无商机</p>
          ) : (
            <ul className="divide-y divide-line">
              {customer.opportunities.map((opp) => (
                <li
                  key={opp.id}
                  className="group flex items-center justify-between py-3 text-sm"
                >
                  <Link
                    href={`/opportunities/${opp.id}`}
                    className="font-medium text-ink transition-colors group-hover:text-brass-600"
                  >
                    {opp.name}
                  </Link>
                  <Badge tone="blue">
                    {stageLabel[opp.stage] ?? opp.stage}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 跟进记录：时间线。占满整行——关系史是详情页最重要的内容 */}
        <section className="card p-6 lg:col-span-2" data-enter="fade">
          <h2 className="mb-5 text-[15px] font-semibold tracking-tight text-ink">
            跟进记录
            <span className="tnum ml-1.5 text-sm font-normal text-ink-faint">
              {customer.followUps.length}
            </span>
          </h2>
          <form
            data-guide="followup-form"
            action={createFollowUp}
            className="mb-6 space-y-3 rounded-xl bg-paper-sunk p-4 ring-1 ring-inset ring-line"
          >
            <div className="text-[13px] font-semibold text-ink">新增跟进</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-xs font-medium text-ink-soft">
                  方式
                </span>
                <select
                  name="mode"
                  defaultValue={FollowUpMode.CALL}
                  className="w-full rounded-lg border border-line-strong bg-paper-raised px-3 py-2 text-sm outline-none transition-colors focus:border-brass-500"
                >
                  {Object.values(FollowUpMode).map((mode) => (
                    <option key={mode} value={mode}>
                      {followUpModeLabel[mode] ?? mode}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs font-medium text-ink-soft">
                  下一步计划跟进时间
                </span>
                <DateTimeField
                  name="nextFollowUpAt"
                  label="下一步计划跟进时间"
                  className="w-full rounded-lg border border-line-strong bg-paper-raised px-3 py-2 text-sm outline-none transition-colors focus:border-brass-500"
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-ink-soft">
                内容
              </span>
              <textarea
                name="content"
                required
                rows={3}
                className="w-full rounded-lg border border-line-strong bg-paper-raised px-3 py-2 text-sm outline-none transition-colors focus:border-brass-500"
                placeholder="记录本次沟通内容"
              />
            </label>
            <button type="submit" className="min-h-11 btn btn-primary">
              保存跟进
            </button>
          </form>

          {customer.followUps.length === 0 ? (
            <p className="text-sm text-ink-faint">暂无跟进记录</p>
          ) : (
            <ol className="relative">
              {/* 时间线竖轨：一条发丝线，节点落在上面 */}
              <span
                aria-hidden
                className="absolute bottom-2 left-[5px] top-2 w-px bg-line-strong"
              />
              {customer.followUps.map((followUp, index) => (
                <li key={followUp.id} className="relative pb-5 pl-7 last:pb-0">
                  {/* 节点：最近一条用金色实心，其余用空心 */}
                  <span
                    aria-hidden
                    className={`absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full ring-2 ring-paper-raised ${
                      index === 0
                        ? "bg-brass-500"
                        : "bg-paper-raised ring-line-strong"
                    }`}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge tone="zinc">
                        {followUpModeLabel[followUp.mode] ?? followUp.mode}
                      </Badge>
                      {followUp.nextFollowUpAt && (
                        <span className="text-xs text-ink-faint">
                          下次跟进：
                          {followUp.nextFollowUpAt.toLocaleString("zh-CN")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {followUp.nextFollowUpAt && (
                        <Link
                          href={`/tasks?customerId=${encodeURIComponent(id)}&followUpId=${encodeURIComponent(followUp.id)}&dueAt=${encodeURIComponent(toDateTimeLocal(followUp.nextFollowUpAt))}&title=${encodeURIComponent(`跟进：${customer.name}`)}`}
                          className="text-xs font-medium text-brass-600 transition-colors hover:text-brass-500"
                        >
                          建任务
                        </Link>
                      )}
                      <span className="tnum text-xs text-ink-faint">
                        {followUp.createdAt.toLocaleString("zh-CN")}
                      </span>
                      <form
                        action={deleteCustomerFollowUpAction.bind(
                          null,
                          id,
                          followUp.id
                        )}
                      >
                        <button
                          type="submit"
                          className="text-xs text-danger transition-opacity hover:opacity-70"
                        >
                          删除
                        </button>
                      </form>
                    </div>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                    {followUp.content}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

/** 把 Date 转为 datetime-local 输入可接受的值（本地时区）。 */
function toDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 信息项：标签小字大写化，值用编辑式排版。 */
function Info({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  /** 电话、邮箱、日期等：用等宽数字特性对齐 */
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
        {label}
      </dt>
      <dd className={`mt-1 text-sm text-ink ${mono ? "tnum" : ""}`}>{value}</dd>
    </div>
  );
}
