"use client";

import { useState } from "react";
import { CustomerLevel } from "@/generated/prisma/enums";
import { createCustomerAction } from "./actions";

/**
 * 新建客户表单。
 *
 * 默认收起，点击「新建客户」展开。提交后由 Server Action 写入数据库。
 */
export function CustomerForm({
  users,
}: {
  users: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-primary"
      >
        + 新建客户
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-line bg-paper-raised p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">新建客户</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-ink-faint hover:text-ink"
        >
          取消
        </button>
      </div>

      <form
        action={createCustomerAction}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <Field
          label="客户名称"
          name="name"
          required
          placeholder="如：Acme 科技"
        />
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">
            客户等级
          </label>
          <select
            name="level"
            defaultValue={CustomerLevel.MEDIUM}
            className="w-full rounded-lg border border-line-strong bg-paper-raised px-3 py-2 text-sm"
          >
            <option value={CustomerLevel.HIGH}>高价值</option>
            <option value={CustomerLevel.MEDIUM}>中价值</option>
            <option value={CustomerLevel.LOW}>低价值</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">
            负责人
          </label>
          <select
            name="ownerId"
            className="w-full rounded-lg border border-line-strong bg-paper-raised px-3 py-2 text-sm"
          >
            <option value="">暂不分配</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>
        <Field label="行业" name="industry" placeholder="如：教育" />
        <Field label="电话" name="phone" placeholder="联系电话" />
        <Field label="邮箱" name="email" placeholder="联系邮箱" />
        <Field label="地址" name="address" placeholder="所在地址" />
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-ink">
            备注
          </label>
          <textarea
            name="remark"
            rows={2}
            className="w-full rounded-lg border border-line-strong bg-paper-raised px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <button type="submit" className="btn btn-primary">
            保存客户
          </button>
        </div>
      </form>
    </div>
  );
}

/** 文本输入字段。 */
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
      <label className="mb-1 block text-sm font-medium text-ink">{label}</label>
      <input
        name={name}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-lg border border-line-strong bg-paper-raised px-3 py-2 text-sm outline-none focus:border-brass-500"
      />
    </div>
  );
}
