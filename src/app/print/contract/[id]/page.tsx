import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { contractStatusLabel } from "@/lib/document-status";
import { getContractForCurrentUser } from "@/app/(dashboard)/contracts/actions";

/**
 * 合同打印页：`/print/contract/[id]`。
 *
 * 与报价单同一套信纸语言：金色信头、发丝线分栏、金额主角、落款留白。
 * 合同的金额比报价更需要「被看见」，放在信头正下方的第一条。
 */
export default async function ContractPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contract = await getContractForCurrentUser(id);
  if (!contract) notFound();

  return (
    <div className="min-h-screen bg-paper py-10 print:bg-white print:py-0">
      <div className="mx-auto max-w-3xl bg-paper-raised px-12 py-12 text-ink shadow-[var(--shadow-lg)] print:shadow-none">
        {/* 屏幕操作区：打印时隐藏 */}
        <div className="mb-10 flex items-center justify-between print:hidden">
          <a
            href={`/contracts/${contract.id}`}
            className="text-[13px] font-medium text-brass-600 transition-colors hover:text-brass-500"
          >
            ← 返回合同详情
          </a>
          <PrintButton />
        </div>

        {/* 信头 */}
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
            <h1 className="text-2xl font-semibold tracking-tight">合同</h1>
            <p className="tnum mt-1.5 text-xs text-ink-faint">
              № {contract.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
        </header>

        {/* 金额主角：合同的第一条信息 */}
        <div className="mt-8 flex items-baseline justify-between border-b-2 border-brass-500 pb-5">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
              合同金额
            </div>
            <div className="mt-2 text-sm text-ink-soft">
              {contract.customer.name} · {contract.opportunity.name}
            </div>
          </div>
          <span className="tnum text-[36px] font-semibold leading-none tracking-[-0.02em]">
            ¥{contract.amount.toLocaleString("zh-CN")}
          </span>
        </div>

        {/* 条款事实：发丝线分栏 */}
        <dl className="mt-8 grid grid-cols-3 gap-x-8 gap-y-6 text-sm">
          <DocField label="客户" value={contract.customer.name} />
          <DocField label="关联商机" value={contract.opportunity.name} />
          <DocField
            label="状态"
            value={contractStatusLabel[contract.status] ?? contract.status}
          />
          <DocField
            label="来源报价"
            value={`№ ${contract.sourceQuotationId.slice(0, 8).toUpperCase()}`}
          />
          <DocField
            label="创建时间"
            value={contract.createdAt.toLocaleDateString("zh-CN")}
          />
        </dl>

        {/* 落款 */}
        <footer className="mt-16 grid grid-cols-2 gap-12">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
              供方（甲方）
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
              客户（乙方）
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
