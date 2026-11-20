/**
 * 用真实飞书通讯录跑一次同步，数据写入 Postgres。
 * 运行：DATABASE_URL=... npx tsx scripts/sync-contacts.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { DbContactStore } from "../src/lib/db/contact-store";
import { prisma } from "../src/lib/db/client";
import { syncContacts } from "../src/lib/feishu/contact/sync";
import {
  listAllDepartments,
  listUsersByDepartment,
} from "../src/lib/feishu/contact/client";
import { getFeishuClient } from "../src/lib/feishu/client";

async function main() {
  if (!process.env.FEISHU_APP_ID || !process.env.FEISHU_APP_SECRET) {
    throw new Error("飞书凭证未配置");
  }
  // 初始化客户端（凭证校验）
  getFeishuClient();
  const store = new DbContactStore();
  const result = await syncContacts(store, {
    listAllDepartments,
    listUsersByDepartment,
  });
  console.log("同步结果:", result);
  console.log("部门数:", await prisma.department.count());
  console.log("用户数:", await prisma.user.count());
  const users = await prisma.user.findMany({
    select: { name: true, feishuOpenId: true, email: true },
  });
  console.log("用户:", users);
}

main()
  .catch((e) => {
    console.error("同步失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
