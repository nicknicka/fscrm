import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PageHeader } from "@/components/ui";
import { requireCurrentUser } from "@/lib/auth/session";
import { accessScopeFor } from "@/lib/auth/scope";
import { getCustomer } from "@/lib/db/repositories/customer";
import {
  OpportunityStage,
  FollowUpMode,
  CustomerLifecycle,
} from "@/generated/prisma/enums";
import { customerLifecycleLabel } from "@/lib/customer-lifecycle";
import { ContactsManager } from "./contacts/contacts-manager";
import { CustomerDetailForm } from "./customer-detail-form";
import { updateCustomerLifecycleAction } from "../lifecycle-actions";
import { listAssignableUsers } from "@/lib/db/repositories/user";
import {
  createCustomerFollowUpAction,
  deleteCustomerFollowUpAction,
} from "../actions";

const followUpModeLabel: Record<string, string> = {
  [FollowUpMode.CALL]: "电话",
  [FollowUpMode.MEETING]: "面谈",
  [FollowUpMode.EMAIL]: "邮件",
  [FollowUpMode.IM]: "即时消息",
  [FollowUpMode.OTHER]: "其他",
};

const stageLabel: Record<string, string> = {
  [OpportunityStage.CONTACT]: "初步接触",
  [OpportunityStage.NEED_CONFIRM]: "需求确认",
  [OpportunityStage.QUOTE]: "报价",
  [OpportunityStage.NEGOTIATE]: "谈判",
  [OpportunityStage.WON]: "赢单",
  [OpportunityStage.LOST]: "输单",
};

/** 客户详情页：基本信息 + 联系人 + 商机 + 跟进记录。 */
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
  const users =
    currentUser.role === "ADMIN"
      ? (await listAssignableUsers(currentUser)).map((user) => ({
          id: user.id,
          name: user.name,
        }))
      : [];

  return (
    <div>
      <Link href="/customers" className="text-sm text-blue-600 hover:underline">
        ← 返回客户列表
      </Link>
      <div className="mt-4">
        <PageHeader
          title={customer.name}
          description={customer.industry ?? "客户详情"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 基本信息 */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold">基本信息</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Info label="客户等级" value={customer.level} />
            <Info
              label="客户生命周期"
              value={customerLifecycleLabel[customer.lifecycle]}
            />
            <Info label="负责人" value={customer.owner?.name ?? "未分配"} />
            <Info label="电话" value={customer.phone ?? "—"} />
            <Info label="邮箱" value={customer.email ?? "—"} />
            <Info label="地址" value={customer.address ?? "—"} />
            <Info
              label="创建时间"
              value={customer.createdAt.toLocaleDateString("zh-CN")}
            />
          </dl>
          {customer.remark && (
            <div className="mt-4 border-t border-zinc-100 pt-4 text-sm">
              <div className="mb-1 text-zinc-500">备注</div>
              <div className="text-zinc-700">{customer.remark}</div>
            </div>
          )}
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
              className="mt-4 border-t border-zinc-100 pt-4"
            >
              <h3 className="mb-2 text-sm font-semibold">调整生命周期</h3>
              <div className="flex items-center gap-2">
                <select
                  name="lifecycle"
                  defaultValue={customer.lifecycle}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                >
                  {Object.values(CustomerLifecycle).map((stage) => (
                    <option key={stage} value={stage}>
                      {customerLifecycleLabel[stage]}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-900"
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

        {/* 商机 */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold">
            商机（{customer.opportunities.length}）
          </h2>
          {customer.opportunities.length === 0 ? (
            <p className="text-sm text-zinc-500">暂无商机</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {customer.opportunities.map((opp) => (
                <li
                  key={opp.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <Link
                    href={`/opportunities/${opp.id}`}
                    className="font-medium text-blue-600 hover:underline"
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

        {/* 跟进记录 */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold">
            跟进记录（{customer.followUps.length}）
          </h2>
          <form
            action={createFollowUp}
            className="mb-4 space-y-3 border-b border-zinc-100 pb-4"
          >
            <div className="text-sm font-medium">新增跟进</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-zinc-600">方式</span>
                <select
                  name="mode"
                  defaultValue={FollowUpMode.CALL}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                >
                  {Object.values(FollowUpMode).map((mode) => (
                    <option key={mode} value={mode}>
                      {followUpModeLabel[mode] ?? mode}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-600">
                  下一步计划跟进时间
                </span>
                <input
                  name="nextFollowUpAt"
                  type="datetime-local"
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600">内容</span>
              <textarea
                name="content"
                required
                rows={3}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                placeholder="记录本次沟通内容"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              保存跟进
            </button>
          </form>
          {customer.followUps.length === 0 ? (
            <p className="text-sm text-zinc-500">暂无跟进记录</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {customer.followUps.map((followUp) => (
                <li key={followUp.id} className="py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge tone="zinc">
                        {followUpModeLabel[followUp.mode] ?? followUp.mode}
                      </Badge>
                      {followUp.nextFollowUpAt && (
                        <span className="text-xs text-zinc-500">
                          下次跟进：
                          {followUp.nextFollowUpAt.toLocaleString("zh-CN")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400">
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
                          className="text-xs text-red-600 hover:underline"
                        >
                          删除
                        </button>
                      </form>
                    </div>
                  </div>
                  <div className="mt-1 text-zinc-700">{followUp.content}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** 信息项。 */
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-zinc-800">{value}</dd>
    </div>
  );
}
