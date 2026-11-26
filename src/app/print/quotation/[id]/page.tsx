import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { requireCurrentUser } from "@/lib/auth/session";
import { accessScopeFor } from "@/lib/auth/scope";
import { getQuotation } from "@/lib/db/repositories/quotation";
import { quotationStatusLabel } from "@/lib/document-status";

/**
 * 报价打印页：`/print/quotation/[id]`。
 *
 * 信纸级排版：单据不在表格框里——页眉是金色字标与单据号，正文用发丝线
 * 分栏而不是边框，合计金额是整页的视觉主角，落款留白给签字与盖章。
 * 屏幕上看是一张纸，打印时操作区隐藏，只留下这张纸。
 */
export default async function QuotationPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireCurrentUser();
  const quotation = await getQuotation(id, accessScopeFor(user));
  if (!quotation) notFound();

  return (
    <div className="min-h-screen bg-paper py-10 print:bg-white print:py-0">
      <div className="mx-auto max-w-3xl bg-paper-raised px-12 py-12 text-ink shadow-[var(--shadow-lg)] print:shadow-none">
        {/* 屏幕操作区：打印时隐藏 */}
        <div className="mb-10 flex items-center justify-between print:hidden">
          <a
            href={`/opportunities/${quotation.opportunityId}`}
            className="text-[13px] font-medium text-brass-600 transition-colors hover:text-brass-500"
          >
            ← 返回商机详情
          </a>
          <PrintButton />
        </div>

        {/* 信头：金色字标 + 单据名 + 编号 */}
        <header className="flex items-start justify-between border-b-2 border-ink pb-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brass-400 to-brass-600 text-sm font-bold text-ink-950">
              F
            </span>
            <div className="leading-none">
              <div className="text-[15px] font-semibold tracking-tight">
                fscrm
              </div>
              <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-ink-faint">
                Feishu Suite
              </div>
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-semibold tracking-tight">报价单</h1>
            <p className="tnum mt-1.5 text-xs text-ink-faint">
              № {quotation.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
        </header>

        {/* 当事方与状态：两栏发丝线分格，不用表格框 */}
        <dl className="mt-8 grid grid-cols-3 gap-x-8 gap-y-6 text-sm">
          <DocField label="客户" value={quotation.customer.name} />
          <DocField label="关联商机" value={quotation.opportunity.name} />
          <DocField
            label="状态"
            value={quotationStatusLabel[quotation.status] ?? quotation.status}
          />
        </dl>

        {/* 报价条目：编辑式表格，数字右对齐等宽 */}
        <h2 className="mt-10 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          报价条目
        </h2>
        <table className="mt-3 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink text-left text-[11px] uppercase tracking-wider text-ink-faint">
              <th className="py-2.5 pr-4 font-medium">名称</th>
              <th className="py-2.5 text-right font-medium">数量</th>
              <th className="py-2.5 text-right font-medium">单价</th>
              <th className="py-2.5 text-right font-medium">小计</th>
            </tr>
          </thead>
          <tbody>
            {quotation.items.map((item) => (
              <tr key={item.id} className="border-b border-line">
                <td className="py-3 pr-4">{item.name}</td>
                <td className="tnum py-3 text-right text-ink-soft">
                  {item.quantity}
                </td>
                <td className="tnum py-3 text-right text-ink-soft">
                  ¥{item.unitPrice.toLocaleString("zh-CN")}
                </td>
                <td className="tnum py-3 text-right">
                  ¥{(item.quantity * item.unitPrice).toLocaleString("zh-CN")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 合计：金额主角，右对齐大数字，金色底线收住 */}
        <div className="mt-6 flex items-baseline justify-between border-b-2 border-brass-500 pb-4">
          <span className="text-sm font-medium text-ink-soft">合计金额</span>
          <span className="tnum text-[32px] font-semibold leading-none tracking-[-0.02em]">
            ¥{quotation.amount.toLocaleString("zh-CN")}
          </span>
        </div>

        {/* 落款：签字与盖章留白 */}
        <footer className="mt-16 grid grid-cols-2 gap-12">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
              供方确认
            </div>
            <div className="mt-8 border-b border-line-strong pb-1 text-sm text-ink-faint">
              签字 / 盖章
            </div>
            <div className="tnum mt-3 text-xs text-ink-faint">
              日期：＿＿＿＿年＿＿月＿＿日
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
              客户确认
            </div>
            <div className="mt-8 border-b border-line-strong pb-1 text-sm text-ink-faint">
              签字 / 盖章
            </div>
            <div className="tnum mt-3 text-xs text-ink-faint">
              日期：＿＿＿＿年＿＿月＿＿日
            </div>
          </div>
        </footer>

        <p className="mt-14 text-center text-[11px] tracking-wide text-ink-faint">
          由 fscrm 生成 · 打印日期 {new Date().toLocaleDateString("zh-CN")}
        </p>
      </div>
    </div>
  );
}

function DocField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
        {label}
      </dt>
      <dd className="mt-1.5 border-t border-line pt-2.5 font-medium">
        {value}
      </dd>
    </div>
  );
}
