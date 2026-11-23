/**
 * 侧边栏导航项的选中态匹配规则。
 *
 * 选中态只在客户端按路由判定，规则需要同时满足两点：
 *   1. 按完整路径段匹配 —— 当前路径等于入口，或位于入口的子路由下；
 *      不能做裸字符串前缀匹配，否则 `/customers/public-pool` 会同时命中
 *      `/customers`，导致「客户」和「公海」两个入口一起高亮。
 *   2. 更具体的入口优先 —— 若父级入口（如「客户」）与子级入口（如「公海」）
 *      同时命中，只高亮路径更长、更具体的那个，避免父子同亮。
 */

/**
 * 判断 `pathname` 是否命中某个入口 `href`。
 *
 * `href` 为根路径时只接受根路径本身；其余情况要求按路径段相等或作为子路由，
 * 例如 `/customers/public-pool` 命中 `/customers`，但 `/customers-x` 不命中。
 * 入口末尾多余的斜杠会被归一化，`/customers/` 与 `/customers` 等价。
 */
export function isPathUnder(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  const normalized = href.replace(/\/+$/, "");
  const prefix = `${normalized}/`;
  return pathname === normalized || pathname.startsWith(prefix);
}

/**
 * 从一组导航入口中选出当前应高亮的那个。
 *
 * 命中规则见 `isPathUnder`；当多个入口命中时取路径最长（最具体）的入口，
 * 返回 `null` 表示当前路径不属于任何入口。
 */
export function pickActiveNavHref(
  pathname: string,
  hrefs: readonly string[]
): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (!isPathUnder(pathname, href)) continue;
    if (best === null || href.length > best.length) {
      best = href;
    }
  }
  return best;
}
