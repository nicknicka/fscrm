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
 * 鉴权二选一：登录会话 Cookie，或 `Authorization: Bearer <api_key>`。
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

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/** 解析请求身份：会话优先，其次 Bearer API Key。 */
async function resolveRequestUser(
  request: Request
): Promise<CurrentUser | null> {
  const sessionUser = await getCurrentUser();
  if (sessionUser) return sessionUser;

  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const resolved = await resolveApiKey(match[1].trim());
  if (!resolved) return null;
  // API Key 只带 userId，构造只读所需的最小 CurrentUser；角色从库读取。
  const user = await prisma.user.findUnique({ where: { id: resolved.userId } });
  if (!user) return null;
  return { id: user.id, name: user.name, role: user.role };
}

/** 按资源与权限读取数据。 */
async function readResource(resource: Resource, user: CurrentUser) {
  const scope = accessScopeFor(user);
  switch (resource) {
    case "customers":
      return listCustomers({}, scope);
    case "leads":
      return listLeads({}, scope);
    case "opportunities":
      return listOpportunities({}, user);
    case "contracts":
      return listContracts(scope);
    case "orders":
      return listOrders(scope);
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

  try {
    const data = await readResource(resource as Resource, user);
    return json({ data, count: data.length }, 200);
  } catch (error) {
    console.error("[api] 读取失败", resource, error);
    return json({ error: "INTERNAL_ERROR" }, 500);
  }
}
