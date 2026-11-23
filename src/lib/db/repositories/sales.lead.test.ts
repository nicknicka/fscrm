import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER_ID = "user_owner";
const OTHER_ID = "user_other";
const ADMIN_ID = "user_admin";

type FakeLead = {
  id: string;
  name: string;
  status: string;
  ownerId: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
};

type ContainsFilter = { contains?: string; mode?: string };

type WhereInput = {
  id?: string;
  ownerId?: string | null;
  status?: string;
  OR?: Array<{
    name?: ContainsFilter;
    contactPhone?: ContainsFilter;
    contactEmail?: ContainsFilter;
  }>;
};

/** 模拟 contains 模糊匹配（忽略大小写，与 Prisma 的 insensitive 一致）。 */
function containsMatch(
  value: string | null | undefined,
  filter?: ContainsFilter
) {
  if (!filter?.contains) return false;
  return (value ?? "").toLowerCase().includes(filter.contains.toLowerCase());
}

const mocks = vi.hoisted(() => {
  const leads: FakeLead[] = [
    {
      id: "lead_mine",
      name: "我的线索",
      status: "NEW",
      ownerId: "user_owner",
      contactPhone: "13800000001",
      contactEmail: "mine@example.com",
    },
    {
      id: "lead_other",
      name: "他人线索",
      status: "NEW",
      ownerId: "user_other",
      contactPhone: "13900000002",
      contactEmail: "other@example.com",
    },
    {
      id: "lead_none",
      name: "未分配线索",
      status: "NEW",
      ownerId: null,
      contactPhone: null,
      contactEmail: null,
    },
  ];

  const matches = (lead: FakeLead, where: WhereInput = {}) =>
    (where.id === undefined || lead.id === where.id) &&
    (where.ownerId === undefined || lead.ownerId === where.ownerId) &&
    (where.status === undefined || lead.status === where.status) &&
    (where.OR === undefined ||
      where.OR.length === 0 ||
      where.OR.some(
        (clause) =>
          containsMatch(lead.name, clause.name) ||
          containsMatch(lead.contactPhone, clause.contactPhone) ||
          containsMatch(lead.contactEmail, clause.contactEmail)
      ));

  return {
    leads,
    findMany: vi.fn(async ({ where = {} }: { where?: WhereInput } = {}) =>
      leads.filter((lead) => matches(lead, where))
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const owner = data.owner as { connect?: { id?: string } } | undefined;
      const ownerId =
        owner?.connect?.id ??
        (data.ownerId as string | null | undefined) ??
        null;
      const created = {
        id: `lead_${leads.length + 1}`,
        name: String(data.name ?? ""),
        status: String(data.status ?? "NEW"),
        ownerId,
      };
      leads.push(created);
      return created;
    }),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id?: string; ownerId?: string };
        data: { status?: string };
      }) => {
        const targets = leads.filter((lead) => matches(lead, where));
        for (const lead of targets) {
          if (data.status) lead.status = data.status;
        }
        return { count: targets.length };
      }
    ),
    update: vi.fn(),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      const index = leads.findIndex((lead) => lead.id === where.id);
      if (index === -1) throw new Error("NOT_FOUND");
      return leads.splice(index, 1)[0];
    }),
    deleteMany: vi.fn(),
    count: vi.fn(
      async ({ where = {} }: { where?: WhereInput } = {}) =>
        leads.filter((lead) => matches(lead, where)).length
    ),
    findFirst: vi.fn(
      async ({ where }: { where: { id?: string; ownerId?: string } }) =>
        leads.find((lead) => matches(lead, where)) ?? null
    ),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
      const found = leads.find((lead) => lead.id === where.id);
      if (!found) throw new Error("NOT_FOUND");
      return found;
    }),
  };
});

vi.mock("@/lib/db/client", () => ({
  prisma: {
    lead: {
      findMany: mocks.findMany,
      create: mocks.create,
      update: mocks.update,
      updateMany: mocks.updateMany,
      delete: mocks.delete,
      deleteMany: mocks.deleteMany,
      count: mocks.count,
      findFirst: mocks.findFirst,
      findUniqueOrThrow: mocks.findUniqueOrThrow,
    },
  },
}));

import {
  countLeadsForPage,
  createLead,
  deleteLead,
  listLeads,
  updateLead,
} from "./sales";
import type { AccessScope } from "@/lib/auth/scope";

const ownerScope: AccessScope = { userId: OWNER_ID, role: "OWNER" };
const adminScope: AccessScope = { userId: ADMIN_ID, role: "ADMIN" };

const initialLeads: FakeLead[] = [
  {
    id: "lead_mine",
    name: "我的线索",
    status: "NEW",
    ownerId: OWNER_ID,
    contactPhone: "13800000001",
    contactEmail: "mine@example.com",
  },
  {
    id: "lead_other",
    name: "他人线索",
    status: "NEW",
    ownerId: OTHER_ID,
    contactPhone: "13900000002",
    contactEmail: "other@example.com",
  },
  { id: "lead_none", name: "未分配线索", status: "NEW", ownerId: null },
];

beforeEach(() => {
  mocks.leads.splice(
    0,
    mocks.leads.length,
    ...initialLeads.map((l) => ({ ...l }))
  );
  for (const key of [
    "findMany",
    "create",
    "updateMany",
    "delete",
    "deleteMany",
    "count",
    "findFirst",
    "findUniqueOrThrow",
  ] as const) {
    mocks[key].mockClear();
  }
});

describe("线索权限范围", () => {
  it("普通负责人只查询本人负责的线索，管理员可见全部", async () => {
    const ownerLeads = await listLeads({}, ownerScope);
    expect(ownerLeads.map((lead) => lead.id)).toEqual(["lead_mine"]);

    const allLeads = await listLeads({}, adminScope);
    expect(allLeads.map((lead) => lead.id)).toEqual([
      "lead_mine",
      "lead_other",
      "lead_none",
    ]);
  });

  it("普通负责人新建线索时只能分配给自己，管理员可指定负责人", async () => {
    const ownerLead = await createLead(
      { name: "负责人新建", owner: { connect: { id: OTHER_ID } } } as never,
      ownerScope
    );
    expect(ownerLead.ownerId).toBe(OWNER_ID);

    const adminLead = await createLead(
      { name: "管理员新建", owner: { connect: { id: OTHER_ID } } } as never,
      adminScope
    );
    expect(adminLead.ownerId).toBe(OTHER_ID);
  });

  it("普通负责人不能更新或删除其他负责人的线索，返回统一不存在的错误", async () => {
    await expect(
      updateLead("lead_other", { status: "CONVERTED" } as never, ownerScope)
    ).rejects.toThrow("NOT_FOUND");
    expect(mocks.leads.find((l) => l.id === "lead_other")?.status).toBe("NEW");

    await expect(deleteLead("lead_other", ownerScope)).rejects.toThrow(
      "NOT_FOUND"
    );
    expect(mocks.leads.some((l) => l.id === "lead_other")).toBe(true);
  });

  it("管理员可更新或删除任意线索", async () => {
    const updated = await updateLead(
      "lead_other",
      { status: "CONVERTED" } as never,
      adminScope
    );
    expect(updated.status).toBe("CONVERTED");
    expect(mocks.update).not.toHaveBeenCalled();

    await expect(deleteLead("lead_other", adminScope)).resolves.toMatchObject({
      id: "lead_other",
    });
    expect(mocks.leads.some((l) => l.id === "lead_other")).toBe(false);
  });
});

describe("线索关键词搜索", () => {
  it("按名称模糊匹配，且不越过负责人权限范围", async () => {
    const leads = await listLeads({ search: "我的" }, ownerScope);
    expect(leads.map((lead) => lead.id)).toEqual(["lead_mine"]);
  });

  it("按电话或邮箱匹配", async () => {
    const byPhone = await listLeads({ search: "13900000002" }, adminScope);
    expect(byPhone.map((lead) => lead.id)).toEqual(["lead_other"]);

    const byEmail = await listLeads({ search: "MINE@EXAMPLE" }, adminScope);
    expect(byEmail.map((lead) => lead.id)).toEqual(["lead_mine"]);
  });

  it("搜索无结果时返回空列表，计数也为 0", async () => {
    const leads = await listLeads({ search: "不存在" }, adminScope);
    const total = await countLeadsForPage({ search: "不存在" }, adminScope);
    expect(leads).toEqual([]);
    expect(total).toBe(0);
  });

  it("分页计数与搜索条件一致", async () => {
    const total = await countLeadsForPage({ search: "线索" }, adminScope);
    expect(total).toBe(3);
  });
});
