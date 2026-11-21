"use client";

import { useActionState } from "react";
import { CustomerLevel } from "@/generated/prisma/enums";
import { updateCustomerDetailAction } from "../actions";

type EditState = { ok: boolean; message: string };

const initialState: EditState = { ok: false, message: "" };

/** 客户详情页的基本信息编辑表单。 */
export function CustomerDetailForm({
  customerId,
  level,
  industry,
  phone,
  email,
  address,
  remark,
  ownerId,
  canReassignOwner,
  users,
}: {
  customerId: string;
  level: CustomerLevel;
  industry?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  remark?: string | null;
  ownerId: string | null;
  canReassignOwner: boolean;
  users: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<EditState, FormData>(
    async (_prevState, formData) => {
      try {
        await updateCustomerDetailAction(customerId, formData);
        return { ok: true, message: "已保存客户基本信息" };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "保存失败",
        };
      }
    },
    initialState
  );

  return (
    <form action={formAction} className="mt-5 border-t border-zinc-100 pt-4">
      <h3 className="mb-3 text-sm font-semibold">编辑基本信息</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="客户等级" name="level">
          <select
            name="level"
            defaultValue={level}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            <option value={CustomerLevel.HIGH}>高价值</option>
            <option value={CustomerLevel.MEDIUM}>中价值</option>
            <option value={CustomerLevel.LOW}>低价值</option>
          </select>
        </Field>
        {canReassignOwner && (
          <Field label="负责人" name="ownerId">
            <select
              name="ownerId"
              defaultValue={ownerId ?? ""}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">移入公海</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="行业" name="industry" defaultValue={industry ?? ""} />
        <Field label="电话" name="phone" defaultValue={phone ?? ""} />
        <Field label="邮箱" name="email" defaultValue={email ?? ""} />
        <Field label="地址" name="address" defaultValue={address ?? ""} />
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            备注
          </label>
          <textarea
            name="remark"
            rows={2}
            defaultValue={remark ?? ""}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "保存中…" : "保存基本信息"}
          </button>
          {state.message && (
            <span
              className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}
            >
              {state.message}
            </span>
          )}
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  children,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-700">
        {label}
      </label>
      {children ?? (
        <input
          name={name}
          defaultValue={defaultValue}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
      )}
    </div>
  );
}
