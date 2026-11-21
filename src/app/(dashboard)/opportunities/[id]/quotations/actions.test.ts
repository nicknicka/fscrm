import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  revalidatePath: vi.fn(),
  createQuotation: vi.fn(),
  updateQuotation: vi.fn(),
  listQuotations: vi.fn(),
  getQuotation: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

vi.mock("@/lib/db/repositories/quotation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/repositories/quotation")>();
  return {
    ...actual,
    createQuotation: mocks.createQuotation,
    updateQuotation: mocks.updateQuotation,
    listQuotations: mocks.listQuotations,
    getQuotation: mocks.getQuotation,
  };
});

import {
  createQuotationAction,
  listQuotationsForCurrentUser,
  updateQuotationAction,
} from "./actions";

const owner = { id: "owner_1", name: "张三", role: "OWNER" as const };
const otherOwner = { id: "owner_2", name: "李四", role: "OWNER" as const };
const admin = { id: "admin_1", name: "管理员", role: "ADMIN" as const };

const NOT_FOUND = { ok: false, error: "NOT_FOUND" } as const;

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => data.append(key, entry));
    } else {
      data.set(key, value);
    }
  }
  return data;
}

function quotationForm(overrides: Record<string, string | string[]> = {}) {
  return form({
    status: "DRAFT",
    "itemName[]": "咨询",
    "itemQuantity[]": "2",
    "itemUnitPrice[]": "150",
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue(owner);
  mocks.createQuotation.mockResolvedValue({ id: "quotation_1" });
  mocks.updateQuotation.mockResolvedValue({ id: "quotation_1" });
  mocks.listQuotations.mockResolvedValue([]);
  mocks.getQuotation.mockResolvedValue(null);
});

describe("报价 Server Actions", () => {
  it("负责人创建报价时解析多个条目并传当前权限范围，成功后刷新商机详情", async () => {
    const result = await createQuotationAction("opportunity_own", quotationForm({
      "itemName[]": ["咨询", "部署"],
      "itemQuantity[]": ["2", "1"],
      "itemUnitPrice[]": ["150", "300"],
    }));

    expect(result).toEqual({ ok: true, quotationId: "quotation_1" });
    expect(mocks.createQuotation).toHaveBeenCalledWith(
      {
        opportunityId: "opportunity_own",
        status: "DRAFT",
        items: [
          { name: "咨询", quantity: 2, unitPrice: 150 },
          { name: "部署", quantity: 1, unitPrice: 300 },
        ],
      },
      { userId: owner.id, role: owner.role }
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/opportunities/opportunity_own"
    );
  });

  it("编辑报价时传条目与状态，成功后刷新商机详情", async () => {
    const result = await updateQuotationAction(
      "quotation_1",
      "opportunity_own",
      quotationForm({
        status: "CONFIRMED",
        "itemName[]": ["咨询"],
        "itemQuantity[]": ["3"],
        "itemUnitPrice[]": ["120"],
      })
    );

    expect(result).toEqual({ ok: true, quotationId: "quotation_1" });
    expect(mocks.updateQuotation).toHaveBeenCalledWith(
      "quotation_1",
      {
        status: "CONFIRMED",
        items: [{ name: "咨询", quantity: 3, unitPrice: 120 }],
      },
      { userId: owner.id, role: owner.role }
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/opportunities/opportunity_own"
    );
  });

  it("跨负责人创建与编辑统一返回 NOT_FOUND，且失败不刷新", async () => {
    mocks.requireCurrentUser.mockResolvedValue(otherOwner);
    const { QuotationNotFoundError } = await import(
      "@/lib/db/repositories/quotation"
    );
    mocks.createQuotation.mockRejectedValue(new QuotationNotFoundError());
    mocks.updateQuotation.mockRejectedValue(new QuotationNotFoundError());

    await expect(
      createQuotationAction("foreign_opportunity", quotationForm())
    ).resolves.toEqual(NOT_FOUND);
    await expect(
      updateQuotationAction(
        "foreign_quotation",
        "foreign_opportunity",
        quotationForm()
      )
    ).resolves.toEqual(NOT_FOUND);

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("空条目、非法数量或非法状态时返回 INVALID_INPUT 且不写库", async () => {
    await expect(
      createQuotationAction("opportunity_own", quotationForm({ "itemName[]": [] }))
    ).resolves.toEqual({ ok: false, error: "INVALID_INPUT" });
    await expect(
      createQuotationAction(
        "opportunity_own",
        quotationForm({ "itemQuantity[]": "0" })
      )
    ).resolves.toEqual({ ok: false, error: "INVALID_INPUT" });
    await expect(
      createQuotationAction(
        "opportunity_own",
        quotationForm({ status: "UNKNOWN" })
      )
    ).resolves.toEqual({ ok: false, error: "INVALID_INPUT" });

    expect(mocks.createQuotation).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("列表读取从会话构造权限范围，且管理员可见全部", async () => {
    await listQuotationsForCurrentUser("opportunity_own");
    mocks.requireCurrentUser.mockResolvedValue(admin);
    await listQuotationsForCurrentUser("opportunity_own");

    expect(mocks.listQuotations).toHaveBeenNthCalledWith(
      1,
      { userId: owner.id, role: owner.role },
      "opportunity_own"
    );
    expect(mocks.listQuotations).toHaveBeenNthCalledWith(
      2,
      { userId: admin.id, role: admin.role },
      "opportunity_own"
    );
  });

  it("所有入口先校验会话，未登录不读写", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("UNAUTHENTICATED"));

    await expect(
      createQuotationAction("opportunity_own", quotationForm())
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(
      updateQuotationAction("quotation_1", "opportunity_own", quotationForm())
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(
      listQuotationsForCurrentUser("opportunity_own")
    ).rejects.toThrow("UNAUTHENTICATED");

    expect(mocks.createQuotation).not.toHaveBeenCalled();
    expect(mocks.updateQuotation).not.toHaveBeenCalled();
    expect(mocks.listQuotations).not.toHaveBeenCalled();
  });
});
