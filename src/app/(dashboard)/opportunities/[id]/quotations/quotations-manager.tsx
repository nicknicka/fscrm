"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QuotationStatus } from "@/generated/prisma/enums";
import { quotationStatusLabel } from "@/lib/document-status";
import { formatMoney } from "@/lib/format-numbers";
import {
  createQuotationFormAction,
  updateQuotationFormAction,
} from "./actions";
import { convertQuotationToContractFormAction } from "@/app/(dashboard)/contracts/actions";

/**
 * 商机详情的报价管理界面（#34/#35）。
 *
 * 新增表单默认收起；每条报价可展开行内编辑表单并修改状态与条目。
 * 条目的数量乘以单价由服务端汇总，界面展示的金额来自服务端返回的报价。
 */

export interface QuotationItemView {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface QuotationView {
  id: string;
  status: QuotationStatus;
  amount: number;
  items: QuotationItemView[];
}

const inputClass =
  "w-full rounded-lg border border-line-strong bg-paper-raised px-3 py-2 text-sm outline-none focus:border-brass-500";

const submitClass = "btn btn-primary min-h-11";

export function QuotationsManager({
  opportunityId,
  quotations,
}: {
  opportunityId: string;
  quotations: QuotationView[];
}) {
  const router = useRouter();
  // Server Action 完成后 refresh 一次，让服务端 revalidate 的结果反映到界面。
  const refreshAfterSubmit = () => setTimeout(() => router.refresh(), 350);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Server Action 不能包在内联箭头函数里传给 <form action>，只能预绑定参数后传引用。
  const createBound = createQuotationFormAction.bind(null, opportunityId);
  const updateBound = (quotationId: string) =>
    updateQuotationFormAction.bind(null, quotationId, opportunityId);
  const convertBound = (quotationId: string) =>
    convertQuotationToContractFormAction.bind(null, quotationId, opportunityId);

  return (
    <section className="card p-6 lg:col-span-2">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">
          报价
          <span className="tnum ml-1.5 text-sm font-normal text-ink-faint">
            {quotations.length}
          </span>
        </h2>
        <button
          type="button"
          onClick={() => {
            setCreating((value) => !value);
            setEditingId(null);
          }}
          className="rounded-lg border border-brass-600 px-3 py-1.5 text-sm font-medium text-brass-600 transition-colors hover:bg-brass-50"
        >
          {creating ? "取消" : "+ 新增报价"}
        </button>
      </div>

      {creating && (
        <form
          action={createBound}
          onSubmit={refreshAfterSubmit}
          className="mb-5 space-y-3 rounded-lg border border-line bg-paper-sunk p-4"
        >
          <ItemFields />
          <div className="flex items-center gap-3">
            <button type="submit" className={submitClass}>
              保存报价
            </button>
            <span className="text-xs text-ink-faint">金额由条目自动汇总</span>
          </div>
        </form>
      )}

      {quotations.length === 0 ? (
        <p className="text-sm text-ink-faint">暂无报价</p>
      ) : (
        <ul className="space-y-3">
          {quotations.map((quotation) => (
            <li
              key={quotation.id}
              className="rounded-xl border border-line bg-paper-raised p-4 text-sm shadow-[var(--shadow-xs)]"
            >
              {editingId === quotation.id ? (
                <form
                  action={updateBound(quotation.id)}
                  onSubmit={refreshAfterSubmit}
                  className="space-y-3"
                >
                  <label className="block">
                    <span className="mb-1 block text-xs text-ink-soft">
                      状态
                    </span>
                    <select
                      name="status"
                      defaultValue={quotation.status}
                      className={inputClass}
                    >
                      {Object.values(QuotationStatus).map((status) => (
                        <option key={status} value={status}>
                          {quotationStatusLabel[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <ItemFields items={quotation.items} />
                  <div className="flex gap-2">
                    <button type="submit" className={submitClass}>
                      保存
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="min-h-11 rounded-lg border border-line-strong px-3 py-2.5 text-sm text-ink-soft hover:bg-paper-sunk"
                    >
                      取消
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-3">
                      <span className="tnum text-xl font-semibold tracking-tight text-ink">
                        {formatMoney(quotation.amount)}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                          quotation.status === QuotationStatus.CONFIRMED
                            ? "bg-ok-bg text-ok ring-ok/20"
                            : quotation.status === QuotationStatus.CANCELLED
                              ? "bg-paper-sunk text-ink-faint ring-line-strong/60"
                              : "bg-warn-bg text-warn ring-warn/25"
                        }`}
                      >
                        {quotationStatusLabel[quotation.status]}
                      </span>
                    </div>
                    {/* 条目明细：小票式排版，数量单价右对齐 */}
                    {quotation.items.length > 0 && (
                      <ul className="mt-2.5 space-y-1">
                        {quotation.items.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-baseline gap-2 text-xs text-ink-soft"
                          >
                            <span className="truncate">{item.name}</span>
                            <span
                              aria-hidden
                              className="mx-1 flex-1 border-b border-dotted border-line-strong"
                            />
                            <span className="tnum shrink-0 text-ink-faint">
                              × {item.quantity} @ {formatMoney(item.unitPrice)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <a
                      href={`/print/quotation/${quotation.id}`}
                      className="text-sm text-brass-600 hover:underline"
                    >
                      打印
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        setCreating(false);
                        setEditingId(quotation.id);
                      }}
                      className="text-sm text-brass-600 hover:underline"
                    >
                      编辑
                    </button>
                    <form
                      action={convertBound(quotation.id)}
                      onSubmit={refreshAfterSubmit}
                    >
                      <button
                        type="submit"
                        disabled={
                          quotation.status !== QuotationStatus.CONFIRMED
                        }
                        title={
                          quotation.status === QuotationStatus.CONFIRMED
                            ? undefined
                            : "报价已确认后才可转为合同"
                        }
                        className="btn btn-primary min-h-11 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-faint"
                      >
                        转为合同
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** 至少一个条目；每行包含名称、数量、单价。 */
function ItemFields({ items = [] }: { items?: QuotationItemView[] }) {
  return (
    <div className="space-y-2">
      <div className="text-xs text-ink-soft">报价条目</div>
      {(items.length > 0
        ? items
        : [{ id: "new", name: "", quantity: 1, unitPrice: 0 }]
      ).map((item) => (
        <div key={item.id} className="grid grid-cols-[2fr_1fr_1fr] gap-2">
          <input
            name="itemName[]"
            required
            defaultValue={item.name}
            placeholder="条目名称"
            className={inputClass}
          />
          <input
            name="itemQuantity[]"
            required
            type="number"
            min="1"
            step="1"
            defaultValue={item.quantity}
            className={inputClass}
          />
          <input
            name="itemUnitPrice[]"
            required
            type="number"
            min="0"
            step="0.01"
            defaultValue={item.unitPrice}
            className={inputClass}
          />
        </div>
      ))}
    </div>
  );
}
