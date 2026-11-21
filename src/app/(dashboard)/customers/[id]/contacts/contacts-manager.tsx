"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createContactFormAction,
  updateContactFormAction,
  deleteContactFormAction,
} from "./actions";

/**
 * 联系人增删改界面（#31）。
 *
 * 新增表单默认收起；每个联系人可展开行内编辑表单并单独删除。
 * 提交交由 Server Action 完成，权限由服务端按所属客户校验。
 */

export interface ContactItem {
  id: string;
  customerId: string;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  remark: string | null;
}

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500";

export function ContactsManager({
  customerId,
  contacts,
}: {
  customerId: string;
  contacts: ContactItem[];
}) {
  const router = useRouter();
  // Server Action 完成后 refresh 一次，让服务端 revalidate 的结果反映到界面。
  const refreshAfterSubmit = () => setTimeout(() => router.refresh(), 350);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Server Action 不能包在内联箭头函数里传给 <form action>，只能预绑定参数后传引用。
  const createBound = createContactFormAction.bind(null, customerId);
  const updateBound = (id: string) => updateContactFormAction.bind(null, id);
  const deleteBound = (id: string) => deleteContactFormAction.bind(null, id);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">联系人（{contacts.length}）</h2>
        <button
          type="button"
          onClick={() => {
            setCreating((value) => !value);
            setEditingId(null);
          }}
          className="rounded-lg border border-blue-600 px-2.5 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50"
        >
          {creating ? "取消" : "+ 新增联系人"}
        </button>
      </div>

      {creating && (
        <form
          action={createBound}
          onSubmit={refreshAfterSubmit}
          className="mb-5 grid grid-cols-1 gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 sm:grid-cols-2"
        >
          <Field label="姓名" name="name" required placeholder="联系人姓名" />
          <Field label="职位" name="position" placeholder="如：采购经理" />
          <Field label="电话" name="phone" placeholder="联系电话" />
          <Field label="邮箱" name="email" placeholder="联系邮箱" />
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              备注
            </label>
            <textarea name="remark" rows={2} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              保存联系人
            </button>
          </div>
        </form>
      )}

      {contacts.length === 0 ? (
        <p className="text-sm text-zinc-500">暂无联系人</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {contacts.map((contact) => (
            <li key={contact.id} className="py-3 text-sm">
              {editingId === contact.id ? (
                <form
                  action={updateBound(contact.id)}
                  onSubmit={refreshAfterSubmit}
                  className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                >
                  <Field
                    label="姓名"
                    name="name"
                    required
                    defaultValue={contact.name}
                  />
                  <Field
                    label="职位"
                    name="position"
                    defaultValue={contact.position ?? ""}
                  />
                  <Field
                    label="电话"
                    name="phone"
                    defaultValue={contact.phone ?? ""}
                  />
                  <Field
                    label="邮箱"
                    name="email"
                    defaultValue={contact.email ?? ""}
                  />
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-zinc-700">
                      备注
                    </label>
                    <textarea
                      name="remark"
                      rows={2}
                      defaultValue={contact.remark ?? ""}
                      className={inputClass}
                    />
                  </div>
                  <div className="flex gap-2 sm:col-span-2">
                    <button
                      type="submit"
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                    >
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
                    <span className="font-medium">{contact.name}</span>
                    {contact.position && (
                      <span className="ml-2 text-zinc-500">
                        {contact.position}
                      </span>
                    )}
                    <div className="text-xs text-zinc-400">
                      {[contact.phone, contact.email].filter(Boolean).join(" ")}
                    </div>
                    {contact.remark && (
                      <div className="mt-1 text-xs text-zinc-500">
                        {contact.remark}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setCreating(false);
                        setEditingId(contact.id);
                      }}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      编辑
                    </button>
                    <form
                      action={deleteBound(contact.id)}
                      onSubmit={refreshAfterSubmit}
                    >
                      <button
                        type="submit"
                        className="text-sm text-red-600 hover:underline"
                      >
                        删除
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

/** 文本输入字段。 */
function Field({
  label,
  name,
  required,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
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
        defaultValue={defaultValue}
        className={inputClass}
      />
    </div>
  );
}
