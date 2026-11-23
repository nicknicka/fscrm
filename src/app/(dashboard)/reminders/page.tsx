import Link from "next/link";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { requireCurrentUser } from "@/lib/auth/session";
import { scanReminders, type ReminderBatch } from "@/lib/reminders/scan";
import { SendRemindersButton } from "./send-button";

/**
 * 待办提醒页：把「机器人会推什么」变成能看见的列表。
 *
 * 管理员看全公司，普通负责人只看自己的——与其它业务页一致，
 * 过滤发生在服务端（`scanReminders` 结果按会话用户收窄）。
 */

const KIND_LABEL: Record<ReminderBatch["kind"], string> = {
  followup_overdue: "跟进超期",
  customer_silent: "客户沉默",
  payment_due: "待回款",
  task_due: "任务到期",
};

const KIND_TONE: Record<
  ReminderBatch["kind"],
  "amber" | "blue" | "zinc" | "red"
> = {
  followup_overdue: "amber",
  customer_silent: "blue",
  payment_due: "zinc",
  task_due: "red",
};

export default async function RemindersPage() {
  const currentUser = await requireCurrentUser();
  const scan = await scanReminders();

  const visible =
    currentUser.role === "ADMIN"
      ? scan.batches
      : scan.batches.filter((b) => b.ownerId === currentUser.id);

  const totalItems = visible.reduce((sum, b) => sum + b.total, 0);

  return (
    <div>
      <div data-enter="rise">
        <PageHeader
          title="待办提醒"
          description={`机器人每天扫描一次并推送到飞书 · 当前共 ${totalItems} 条待办`}
          action={
            currentUser.role === "ADMIN" ? <SendRemindersButton /> : undefined
          }
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState message="没有待处理事项。销售数据都很健康。" />
      ) : (
        <div className="space-y-4">
          {visible.map((batch) => (
            <section
              key={`${batch.ownerId}-${batch.kind}`}
              className="rounded-xl border border-zinc-200 bg-white p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <Badge tone={KIND_TONE[batch.kind]}>
                    {KIND_LABEL[batch.kind]}
                  </Badge>
                  <h2 className="text-sm font-semibold text-zinc-900">
                    {batch.ownerName}
                  </h2>
                  <span className="text-sm text-zinc-500">
                    {batch.total} 条
                  </span>
                </div>
                <span className="text-xs text-zinc-400">
                  {batch.ownerOpenId
                    ? "飞书已绑定，会收到卡片"
                    : "未绑定飞书，收不到卡片"}
                </span>
              </div>

              <ul className="mt-3 divide-y divide-zinc-100">
                {batch.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                  >
                    <span className="text-zinc-800">{item.title}</span>
                    <span className="text-zinc-500">{item.detail}</span>
                    {item.customerId && (
                      <Link
                        href={`/customers/${item.customerId}`}
                        className="text-blue-600 hover:underline"
                      >
                        打开 →
                      </Link>
                    )}
                  </li>
                ))}
                {batch.total > batch.items.length && (
                  <li className="py-2 text-xs text-zinc-400">
                    还有 {batch.total - batch.items.length} 条未展示
                  </li>
                )}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
