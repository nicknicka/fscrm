import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { accessScopeFor } from "@/lib/auth/scope";
import { prisma } from "@/lib/db/client";
import { resolveApiKey } from "@/lib/api-key";
import { listCustomers } from "@/lib/db/repositories/customer";
import { listLeads, listOpportunities } from "@/lib/db/repositories/sales";
import { listContracts } from "@/lib/db/repositories/contract";
import { listOrders } from "@/lib/db/repositories/order";
/** 只读业务数据 API：`GET /api/v1/<resource>`。
 *
 * 鉴权二选一：`Authorization: Bearer <api_key>` 优先，其次登录会话 Cookie。
 * API Key 关联的用户决定数据权限范围——与网页端完全同源，无第二套口径。
 * 仅支持白名单资源，只提供读取，不写入。
 */

const RESOURCES = [
  "customers",
  "leads",
  "opportunities",
  "contracts",
  "orders",
] as const;
type Resource = (typeof RESOURCES)[number];

/** 默认每页条数；单次最多 100 条。 */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/** offset 默认 0，不接受负数。 */
const DEFAULT_OFFSET = 0;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * 解析非负整数查询参数；非法或缺失时回落到默认值。
 * 支持重复参数时取第一个值，避免数组值导致 Number() 得到 NaN 后误判。
 */
function parseIntegerParam(
  url: URL,
  key: string,
  defaultValue: number
): number {
  const raw = url.searchParams.get(key);
  if (raw === null) return defaultValue;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : defaultValue;
}

/** 解析请求身份：Bearer API Key 优先，其次 Cookie 会话。 */
async function resolveRequestUser(
  request: Request
): Promise<CurrentUser | null> {
  // API Key 优先：调试时不同的 key 会切换身份，Cookie 不能覆盖它。
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match) {
    const resolved = await resolveApiKey(match[1].trim());
    if (!resolved) return null;
    // API Key 只带 userId，构造只读所需的最小 CurrentUser；角色从库读取。
    const user = await prisma.user.findUnique({
      where: { id: resolved.userId },
    });
    if (!user) return null;
    return { id: user.id, name: user.name, role: user.role };
  }

  // 没有 Bearer 头时才回落到网页登录会话。
  return getCurrentUser();
}

/** 按资源、权限范围与分页参数读取数据。 */
async function readResource(
  resource: Resource,
  user: CurrentUser,
  skip: number,
  take: number
) {
  const scope = accessScopeFor(user);
  switch (resource) {
    case "customers":
      return listCustomers({ skip, take }, scope);
    case "leads":
      return listLeads({ skip, take }, scope);
    case "opportunities":
      return listOpportunities({ skip, take }, user);
    case "contracts":
      return listContracts(scope, { skip, take });
    case "orders":
      return listOrders(scope, { skip, take });
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ resource: string }> }
) {
  const user = await resolveRequestUser(request);
  if (!user) return json({ error: "UNAUTHORIZED" }, 401);

  const { resource } = await params;
  if (!(RESOURCES as readonly string[]).includes(resource)) {
    return json({ error: "UNKNOWN_RESOURCE" }, 404);
  }

  const url = new URL(request.url);
  const limit = Math.min(
    parseIntegerParam(url, "limit", DEFAULT_LIMIT),
    MAX_LIMIT
  );
  const offset = parseIntegerParam(url, "offset", DEFAULT_OFFSET);

  try {
    const data = await readResource(resource as Resource, user, offset, limit);
    return json(
      {
        data,
        pagination: { limit, offset, count: data.length },
      },
      200
    );
  } catch (error) {
    console.error("[api] 读取失败", resource, error);
    return json({ error: "INTERNAL_ERROR" }, 500);
  }
}
