import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER_ID = "user_owner";
const OTHER_ID = "user_other";
const ADMIN_ID = "user_admin";

type TxMock = {
  customer: { create: ReturnType<typeof vi.fn> };
  opportunity: { create: ReturnType<typeof vi.fn> };
  lead: { updateMany: ReturnType<typeof vi.fn> };
};

const mocks = vi.hoisted(() => ({
  findLead: vi.fn(),
  transaction: vi.fn(),
  getUserById: vi.fn(),
  notifyUser: vi.fn(),
  tx: {
    customer: { create: vi.fn() },
    opportunity: { create: vi.fn() },
    lead: { updateMany: vi.fn() },
  } as {
    customer: { create: ReturnType<typeof vi.fn> };
    opportunity: { create: ReturnType<typeof vi.fn> };
    lead: { updateMany: ReturnType<typeof vi.fn> };
  },
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    lead: { findUnique: mocks.findLead },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/db/repositories/user", () => ({
  getUserById: mocks.getUserById,
}));

vi.mock("@/lib/feishu/message/notify", () => ({
  notifyUser: mocks.notifyUser,
}));

import {
  convertLeadToCustomerAndOpportunity,
  LeadConversionError,
} from "./conversion";
import type { AccessScope } from "@/lib/auth/scope";

const owner: AccessScope = { userId: OWNER_ID, role: "OWNER" };
const other: AccessScope = { userId: OTHER_ID, role: "OWNER" };
const admin: AccessScope = { userId: ADMIN_ID, role: "ADMIN" };

const lead = {
  id: "lead_1",
  name: "展会名单-A公司",
  source: "官网表单",
  status: "FOLLOWING",
  ownerId: OWNER_ID,
  contactPhone: "13800000000",
  contactEmail: "a@example.com",
  remark: "有意向",
};

const customer = {
  id: "customer_new",
  name: lead.name,
  phone: lead.contactPhone,
  email: lead.contactEmail,
  ownerId: OWNER_ID,
};

const opportunity = {
  id: "opp_new",
  name: lead.name,
  customerId: customer.id,
  ownerId: OWNER_ID,
  stage: "CONTACT",
};

/** 默认让事务回调拿到 mock tx 并返回其真实结果。 */
function happyPath() {
  mocks.findLead.mockResolvedValue(lead);
  mocks.transaction.mockImplementation(
    async (fn: (tx: TxMock) => Promise<unknown>) => fn(mocks.tx)
  );
  mocks.tx.lead.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.customer.create.mockResolvedValue(customer);
  mocks.tx.opportunity.create.mockResolvedValue({
    ...opportunity,
    ownerId: OWNER_ID,
  });
  mocks.getUserById.mockResolvedValue({
    name: "张三",
    feishuOpenId: "ou_owner",
  });
  mocks.notifyUser.mockResolvedValue({ sent: true });
}

beforeEach(() => {
  vi.resetAllMocks();
  happyPath();
});

describe("线索转化服务（prisma.$transaction 接缝）", () => {
  it("在一次事务中创建新客户并继承名称与联系方式，创建关联商机并继承名称与来源，再把线索改为已转化", async () => {
    const result = await convertLeadToCustomerAndOpportunity(lead.id, owner);

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.customer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: lead.name,
        phone: lead.contactPhone,
        email: lead.contactEmail,
        owner: { connect: { id: OWNER_ID } },
      }),
    });
    expect(mocks.tx.opportunity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: lead.name,
        customer: { connect: { id: customer.id } },
        owner: { connect: { id: OWNER_ID } },
        // 商机模型无 source 字段，来源写入备注保留
        remark: `来源：${lead.source}\n${lead.remark}`,
      }),
    });
    expect(mocks.tx.lead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: lead.id,
          status: { not: "CONVERTED" },
          ownerId: OWNER_ID,
        }),
        data: { status: "CONVERTED" },
      })
    );
    expect(result).toEqual({
      customer,
      opportunity,
      leadId: lead.id,
    });
  });

  it("转化成功后按商机的实际负责人发送 opportunity_created 通知", async () => {
    mocks.tx.opportunity.create.mockResolvedValue({
      ...opportunity,
      ownerId: OTHER_ID,
    });

    await convertLeadToCustomerAndOpportunity(lead.id, admin, {
      ownerId: OTHER_ID,
    });

    expect(mocks.getUserById).toHaveBeenCalledWith(OTHER_ID);
    expect(mocks.notifyUser).toHaveBeenCalledWith(
      { name: "张三", feishuOpenId: "ou_owner" },
      "opportunity_created",
      {
        opportunityName: opportunity.name,
        customerName: customer.name,
      }
    );
  });

  it("通知失败不影响转化结果", async () => {
    mocks.notifyUser.mockRejectedValue(new Error("FEISHU_DOWN"));

    await expect(
      convertLeadToCustomerAndOpportunity(lead.id, owner)
    ).resolves.toEqual({ customer, opportunity, leadId: lead.id });
  });

  it("每次转化都新建客户，不按名称查找或复用已有客户", async () => {
    await convertLeadToCustomerAndOpportunity(lead.id, owner);

    expect(mocks.tx.customer.create).toHaveBeenCalledTimes(1);
    expect(mocks.tx.customer).not.toHaveProperty("findFirst");
    expect(mocks.tx.customer).not.toHaveProperty("findUnique");
  });

  it("普通负责人转化他人线索被拒绝，且不执行任何写入", async () => {
    mocks.tx.lead.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      convertLeadToCustomerAndOpportunity(lead.id, other)
    ).rejects.toThrow("FORBIDDEN");
    expect(mocks.tx.customer.create).not.toHaveBeenCalled();
    expect(mocks.tx.opportunity.create).not.toHaveBeenCalled();
  });

  it("管理员可指定负责人：新客户与商机归属指定负责人，线索状态仍改为已转化", async () => {
    mocks.tx.lead.updateMany.mockResolvedValue({ count: 1 });
    mocks.findLead.mockResolvedValue({ ...lead, ownerId: OTHER_ID });

    await convertLeadToCustomerAndOpportunity(lead.id, admin, {
      ownerId: OTHER_ID,
    });

    expect(mocks.tx.customer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        owner: { connect: { id: OTHER_ID } },
      }),
    });
    expect(mocks.tx.opportunity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        owner: { connect: { id: OTHER_ID } },
      }),
    });
    expect(mocks.tx.lead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: lead.id }),
        data: { status: "CONVERTED" },
      })
    );
    expect(mocks.tx.lead.updateMany.mock.calls[0][0].where).not.toHaveProperty(
      "ownerId"
    );
  });

  it("普通负责人不能通过选项伪造负责人，新对象强制归属本人", async () => {
    await convertLeadToCustomerAndOpportunity(lead.id, owner, {
      ownerId: OTHER_ID,
    });

    expect(mocks.tx.customer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        owner: { connect: { id: OWNER_ID } },
      }),
    });
    expect(mocks.tx.opportunity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        owner: { connect: { id: OWNER_ID } },
      }),
    });
  });

  it("重复转化已被转化的线索被拒绝，不创建新客户或商机", async () => {
    mocks.tx.lead.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      convertLeadToCustomerAndOpportunity(lead.id, owner)
    ).rejects.toThrow(LeadConversionError);
    expect(mocks.tx.customer.create).not.toHaveBeenCalled();
    expect(mocks.tx.opportunity.create).not.toHaveBeenCalled();
  });

  it("商机创建失败时 $transaction 回滚：不留下客户，线索状态不变", async () => {
    mocks.tx.opportunity.create.mockRejectedValue(new Error("DB_DOWN"));
    // 模拟 Prisma：回调内的写入已发生，然后整个事务失败回滚。
    mocks.transaction.mockImplementation(
      async (fn: (tx: TxMock) => Promise<unknown>) => {
        await fn(mocks.tx);
        throw new Error("DB_DOWN");
      }
    );

    await expect(
      convertLeadToCustomerAndOpportunity(lead.id, owner)
    ).rejects.toThrow("DB_DOWN");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.customer.create).toHaveBeenCalledTimes(1);
    expect(mocks.tx.opportunity.create).toHaveBeenCalledTimes(1);
  });
});
