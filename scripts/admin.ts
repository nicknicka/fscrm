/**
 * 管理员任命 / 撤销（命令行）。
 *
 * 运行：
 *   npm run admin -- grant --id <用户内部ID>
 *   npm run admin -- revoke --open-id <飞书open_id>
 */
// 必须最先求值：加载 .env.local 后，后续 import 的数据库客户端才能拿到 DATABASE_URL。
import "./env-bootstrap";

import {
  grantAdmin,
  revokeAdmin,
  type UserRef,
} from "../src/lib/db/repositories/user";
import { prisma } from "../src/lib/db/client";

export type AdminAction = "grant" | "revoke";

export interface ParsedAdminArgs {
  action: AdminAction;
  ref: UserRef;
}

const USAGE =
  "用法: npm run admin -- <grant|revoke> (--id <用户内部ID> | --open-id <飞书open_id>)";

/** 解析命令行参数；用法错误时抛错，交由 main 打印并以非零码退出。 */
export function parseAdminArgs(argv: string[]): ParsedAdminArgs {
  const [action, ...rest] = argv;
  if (action !== "grant" && action !== "revoke") {
    throw new Error(USAGE);
  }

  let id: string | undefined;
  let openId: string | undefined;
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (flag === "--id") id = value;
    else if (flag === "--open-id") openId = value;
    else throw new Error(`无法识别的参数: ${flag}。${USAGE}`);
  }

  if (id && openId) {
    throw new Error("只能提供一个定位条件：--id 或 --open-id");
  }
  if (!id && !openId) {
    throw new Error("缺少定位条件，请使用 --id 或 --open-id");
  }

  return {
    action,
    ref: id ? { id } : { openId },
  };
}

/** 用户定位条件的展示标签与值，避免对 Object.entries(ref)[0] 做元组索引。 */
function describeRef(ref: UserRef): string {
  if (typeof ref.id === "string" && ref.id.length > 0) {
    return `--id=${ref.id}`;
  }
  return `--open-id=${ref.openId}`;
}

export async function main(argv: string[] = process.argv.slice(2)) {
  try {
    const { action, ref } = parseAdminArgs(argv);
    const user =
      action === "grant" ? await grantAdmin(ref) : await revokeAdmin(ref);
    console.log(
      `[fscrm] 已${action === "grant" ? "任命为管理员" : "撤销管理员"}：` +
        `${describeRef(ref)}，当前角色 ${user.role}（${user.name}）`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[fscrm] 操作失败:", message);
    console.error(USAGE);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("/admin.ts")) {
  void main();
}
