"use client";

import { useState } from "react";
import { OpportunityStage } from "@/generated/prisma/enums";
import { OPPORTUNITY_STAGES } from "@/lib/opportunity-stages";
import { createOpportunityAction } from "./actions";

/** 新建商机表单。 */
export function OpportunityForm({
  customers,
  users,
  defaultOwnerId,
  stages = OPPORTUNITY_STAGES.map((s) => ({ value: s.value, label: s.label })),
}: {
  customers: { id: string; name: string }[];
  users: { id: string; name: string }[];
  defaultOwnerId: string;
  stages?: readonly { value: OpportunityStage; label: string }[];
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        + 新建商机
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">新建商机</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-zinc-500 hover:text-zinc-800"
        >
          取消
        </button>
      </div>
      <form
        action={createOpportunityAction}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <Field
          label="商机名称"
          name="name"
          required
          placeholder="如：年度采购合同"
        />
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            关联客户
          </label>
          <select
            name="customerId"
            required
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">请选择客户</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            销售阶段
          </label>
          <select
            name="stage"
            defaultValue={stages[0]?.value ?? OpportunityStage.CONTACT}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            {stages.map((stage) => (
              <option key={stage.value} value={stage.value}>
                {stage.label}
              </option>
            ))}
          </select>
        </div>
        <Field label="预计金额" name="amount" placeholder="如：50000" />
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            负责人
          </label>
          <select
            name="ownerId"
            defaultValue={defaultOwnerId}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>
        <Field
          label="预计成交日期"
          name="expectedCloseDate"
          placeholder="YYYY-MM-DD"
        />
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            备注
          </label>
          <textarea
            name="remark"
            rows={2}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            保存商机
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  required,
  placeholder,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-700">
        {label}
      </label>
      <input
        name={name}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
      />
    </div>
  );
}
