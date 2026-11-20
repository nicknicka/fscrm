import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    department: { findUnique: vi.fn() },
    user: { upsert: vi.fn() },
  },
}));

import { prisma } from "@/lib/db/client";
import { DbContactStore } from "./contact-store";
import type { CrmPerson } from "../feishu/contact/types";

const person: CrmPerson = {
  id: "ou_1",
  feishuOpenId: "ou_1",
  name: "张三",
  role: "OWNER",
};

describe("DbContactStore 通讯录持久化", () => {
  it("新建用户按普通负责人角色写入，不自动提升为管理员", async () => {
    vi.mocked(prisma.department.findUnique).mockResolvedValue(null);
    const upsert = vi.mocked(prisma.user.upsert).mockResolvedValue({} as never);

    await new DbContactStore().upsertPersons([person]);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ role: "OWNER" }),
      })
    );
  });

  it("同步已有管理员时不覆盖其角色", async () => {
    vi.mocked(prisma.department.findUnique).mockResolvedValue(null);
    const upsert = vi.mocked(prisma.user.upsert).mockResolvedValue({} as never);

    await new DbContactStore().upsertPersons([{ ...person, role: "ADMIN" }]);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.not.objectContaining({ role: expect.anything() }),
      })
    );
  });
});
