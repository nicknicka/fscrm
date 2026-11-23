/**
 * 列表分页的共享工具。
 *
 * 只负责「URL 查询参数 → 分页参数」和「分页元数据 → 渲染信息」的纯计算，
 * 不含任何数据访问，便于页面与仓储层共用同一套口径。
 */

/** 默认每页条数。与仓储层 listXxx 的默认 take 保持一致。 */
export const DEFAULT_PAGE_SIZE = 20;

/** 允许的每页条数选项。 */
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

/** 从 searchParams 中取一个字符串值（忽略数组与非法值）。 */
function firstString(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** 解析后的分页参数，可直接传给仓储层的 skip/take。 */
export interface PaginationParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

/**
 * 解析分页参数。
 *
 * - page 从 1 开始，非法值（<=0、非整数、NaN）一律回落到 1；
 * - pageSize 只允许 PAGE_SIZE_OPTIONS 中的值，否则回落默认；
 * - skip/take 由 page/pageSize 推导，供 Prisma 直接使用。
 */
export function parsePagination(params: {
  page?: string | string[] | undefined;
  pageSize?: string | string[] | undefined;
}): PaginationParams {
  const rawPage = Number(firstString(params.page));
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const rawSize = Number(firstString(params.pageSize));
  const pageSize = PAGE_SIZE_OPTIONS.includes(
    rawSize as (typeof PAGE_SIZE_OPTIONS)[number]
  )
    ? rawSize
    : DEFAULT_PAGE_SIZE;

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** 渲染分页控件所需的元数据。 */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  prevPage: number | null;
  nextPage: number | null;
}

/**
 * 由分页参数与总数计算元数据。
 *
 * total=0 时 totalPages 记为 1，便于界面显示「第 1 页 / 共 1 页」。
 * 若传入的 page 超出实际页数（例如数据被删后落到空页），调用方应据此
 * 把 page 夹回 totalPages 再重新查询；本函数只做如实计算，不做夹取。
 */
export function buildPaginationMeta(
  pagination: PaginationParams,
  total: number
): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize));
  const { page } = pagination;
  return {
    page,
    pageSize: pagination.pageSize,
    total,
    totalPages,
    hasPrev: page > 1,
    hasNext: page < totalPages,
    prevPage: page > 1 ? page - 1 : null,
    nextPage: page < totalPages ? page + 1 : null,
  };
}

/**
 * 构造保留现有查询条件的分页链接。
 *
 * 只接受字符串型条件值（数组值如多选筛选当前不支持，会被忽略），
 * 并设置 page/pageSize；调用方把当前搜索/筛选条件原样传入即可保持条件一致。
 */
export function paginationHref(
  pathname: string,
  filters: Record<string, string | string[] | undefined>,
  page: number,
  pageSize: number
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (key === "page" || key === "pageSize") continue;
    const first = firstString(value);
    if (first) search.set(key, first);
  }
  search.set("page", String(page));
  if (pageSize !== DEFAULT_PAGE_SIZE) {
    search.set("pageSize", String(pageSize));
  }
  return `${pathname}?${search.toString()}`;
}
