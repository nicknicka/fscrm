import { listAssignableUsers } from "@/lib/db/repositories/user";
import { prisma } from "@/lib/db/client";
import type { CurrentUser } from "@/lib/auth/session";

/** 商机表单数据按会话角色收窄。 */

export async function loadOpportunityFormCustomers(scope: CurrentUser) {
  return prisma.customer.findMany({
    where: scope.role === "OWNER" ? { ownerId: scope.id } : {},
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function loadOpportunityFormUsers(scope: CurrentUser) {
  return listAssignableUsers(scope);
}
