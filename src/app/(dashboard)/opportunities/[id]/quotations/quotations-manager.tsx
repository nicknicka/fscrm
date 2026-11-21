"use client";

import { useState } from "react";
import { QuotationStatus } from "@/generated/prisma/enums";
import {
  createQuotationAction,
  updateQuotationAction,
} from "./actions";
import { convertQuotationToContractAction } from "@/app/(dashboard)/contracts/actions";

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
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500";

const statusLabel: Record<string, string> = {
  [QuotationStatus.DRAFT]: "草稿",
  [QuotationStatus.CONFIRMED]: "已确认",
  [QuotationStatus.CANCELLED]: "已取消",
};

const submitClass =
  "rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700";

/** React form action 要求 void 返回；结果由状态文本展示，权限仍在服务端校验。 */
function submit(result: Promise<{ ok: boolean; error?: string }>) {
  void result;
}

export function QuotationsManager({
  opportunityId,
  quotations,
}: {
  opportunityId: string;
  quotations: QuotationView[];
}) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">报价（{quotations.length}）</h2>
        <button
          type="button"
          onClick={() => {
            setCreating((value) => !value);
            setEditingId(null);
          }}
          className="rounded-lg border border-blue-600 px-2.5 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50"
        >
          {creating ? "取消" : "+ 新增报价"}
        </button>
      </div>

      {creating && (
        <form
          action={(formData) =>
            submit(createQuotationAction(opportunityId, formData))
          }
          className="mb-5 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4"
        >
          <ItemFields />
          <div className="flex items-center gap-3">
            <button type="submit" className={submitClass}>
              保存报价
            </button>
            <span className="text-xs text-zinc-500">金额由条目自动汇总</span>
          </div>
        </form>
      )}

      {quotations.length === 0 ? (
        <p className="text-sm text-zinc-500">暂无报价</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {quotations.map((quotation) => (
            <li key={quotation.id} className="py-3 text-sm">
              {editingId === quotation.id ? (
                <form
                  action={(formData) =>
                    submit(
                      updateQuotationAction(
                        quotation.id,
                        opportunityId,
                        formData
                      )
                    )
                  }
                  className="space-y-3"
                >
                  <label className="block">
                    <span className="mb-1 block text-xs text-zinc-600">
                      状态
                    </span>
                    <select
                      name="status"
                      defaultValue={quotation.status}
                      className={inputClass}
                    >
                      {Object.values(QuotationStatus).map((status) => (
                        <option key={status} value={status}>
                          {statusLabel[status] ?? status}
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
                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
                    >
                      取消
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        ¥{quotation.amount.toLocaleString("zh-CN")}
                      </span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                        {statusLabel[quotation.status] ?? quotation.status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {quotation.items.length === 0
                        ? "暂无条目"
                        : quotation.items
                            .map(
                              (item) =>
                                `${item.name} × ${item.quantity} @ ¥${item.unitPrice}`
                            )
                            .join("；")}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setCreating(false);
                        setEditingId(quotation.id);
                      }}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      编辑
                    </button>
                    <form
                      action={() =>
                        convertQuotationToContractAction(
                          quotation.id,
                          opportunityId
                        ).then(() => undefined)
                      }
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
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
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
      <div className="text-xs text-zinc-600">报价条目</div>
      {(items.length > 0 ? items : [{ id: "new", name: "", quantity: 1, unitPrice: 0 }])
        .map((item) => (
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
