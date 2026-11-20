"use client";

import { useState } from "react";
import { LeadStatus } from "@/generated/prisma/enums";
import { createLeadAction } from "./actions";

/** 新建线索表单。 */
export function LeadForm() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        + 新建线索
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">新建线索</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-zinc-500 hover:text-zinc-800"
        >
          取消
        </button>
      </div>
      <form
        action={createLeadAction}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <Field
          label="线索名称"
          name="name"
          required
          placeholder="如：展会名单-A公司"
        />
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            状态
          </label>
          <select
            name="status"
            defaultValue={LeadStatus.NEW}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            <option value={LeadStatus.NEW}>新线索</option>
            <option value={LeadStatus.FOLLOWING}>跟进中</option>
            <option value={LeadStatus.CONVERTED}>已转化</option>
            <option value={LeadStatus.INVALID}>无效</option>
          </select>
        </div>
        <Field label="来源" name="source" placeholder="如：官网表单" />
        <Field label="电话" name="contactPhone" placeholder="联系电话" />
        <Field label="邮箱" name="contactEmail" placeholder="联系邮箱" />
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
            保存线索
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
