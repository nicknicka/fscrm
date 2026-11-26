"use client";

import Link from "next/link";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  paginationHref,
  type PaginationMeta,
} from "@/lib/pagination";

/**
 * 通用分页控件。
 *
 * 纯展示组件：接收分页元数据、当前路径与需保留的查询条件，
 * 用普通 Link 渲染「上一页/页码/下一页」和每页条数切换。
 * 页码链接由 paginationHref 生成，保证搜索/筛选条件不丢。
 */
export function Pagination({
  meta,
  pathname,
  filters = {},
}: {
  meta: PaginationMeta;
  pathname: string;
  filters?: Record<string, string | string[] | undefined>;
}) {
  const link = (page: number, size = meta.pageSize) =>
    paginationHref(pathname, filters, page, size);

  // 请求的页码超出实际范围（如数据被删后落到空页）：给出回到末页的入口，
  // 而不是让用户对着空列表不知所措。
  if (meta.page > meta.totalPages) {
    return (
      <div className="mt-4 rounded-lg border border-warn/25 bg-warn-bg px-4 py-3 text-sm text-warn">
        第 {meta.page} 页已超出范围（共 {meta.totalPages} 页）。
        <Link
          href={link(meta.totalPages)}
          className="ml-2 font-medium underline"
        >
          返回第 {meta.totalPages} 页
        </Link>
      </div>
    );
  }

  const pageNumbers = Array.from(
    { length: meta.totalPages },
    (_, index) => index + 1
  );

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-soft">
      <div className="text-ink-faint">
        共 {meta.total} 条 · 第 {meta.page} / {meta.totalPages} 页
      </div>

      <div className="flex items-center gap-2">
        {meta.hasPrev && meta.prevPage !== null ? (
          <Link
            href={link(meta.prevPage)}
            className="rounded-lg border border-line-strong px-3 py-1.5 hover:bg-paper-sunk"
          >
            上一页
          </Link>
        ) : (
          <span className="rounded-lg border border-line px-3 py-1.5 text-ink-faint">
            上一页
          </span>
        )}

        {pageNumbers.map((number) => (
          <Link
            key={number}
            href={link(number)}
            aria-current={number === meta.page ? "page" : undefined}
            className={
              number === meta.page
                ? "rounded-lg bg-ink-800 px-3 py-1.5 font-medium text-white"
                : "rounded-lg border border-line-strong px-3 py-1.5 hover:bg-paper-sunk"
            }
          >
            {number}
          </Link>
        ))}

        {meta.hasNext && meta.nextPage !== null ? (
          <Link
            href={link(meta.nextPage)}
            className="rounded-lg border border-line-strong px-3 py-1.5 hover:bg-paper-sunk"
          >
            下一页
          </Link>
        ) : (
          <span className="rounded-lg border border-line px-3 py-1.5 text-ink-faint">
            下一页
          </span>
        )}
      </div>

      <form action={pathname} method="get" className="flex items-center gap-2">
        {Object.entries(filters).map(([key, value]) => {
          const first = typeof value === "string" ? value : undefined;
          return first ? (
            <input key={key} type="hidden" name={key} value={first} />
          ) : null;
        })}
        <label htmlFor="pageSize" className="text-ink-faint">
          每页
        </label>
        <select
          id="pageSize"
          name="pageSize"
          defaultValue={meta.pageSize}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="rounded-lg border border-line-strong bg-paper-raised px-2 py-1 text-sm"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </form>
    </div>
  );
}

/** 默认页大小，供页面在无需自定义时引用（保持与工具函数同一来源）。 */
export { DEFAULT_PAGE_SIZE };
