/**
 * 飞书通讯录同步（命令行）。
 *
 * 运行：npm run feishu:sync-contacts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { runContactSync } from "../src/lib/services/contact-sync";
import { prisma } from "../src/lib/db/client";

async function main() {
  console.log("[fscrm] 开始同步飞书通讯录...");
  const outcome = await runContactSync();

  if (!outcome.ok) {
    console.error("[fscrm] 同步失败:", outcome.error);
    process.exitCode = 1;
    return;
  }

  console.log(
    `[fscrm] 同步完成：部门 ${outcome.result?.departmentCount ?? 0} 个，` +
      `人员 ${outcome.result?.personCount ?? 0} 个，耗时 ${outcome.durationMs}ms`
  );
  console.log(
    `[fscrm] 数据库当前：部门 ${outcome.totals?.departments ?? 0} 个，` +
      `用户 ${outcome.totals?.users ?? 0} 个`
  );
}

main().finally(async () => {
  await prisma.$disconnect();
});
