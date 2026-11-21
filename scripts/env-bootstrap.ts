/**
 * 命令行入口的环境变量引导。
 *
 * ESM 会先求值所有静态 import，因此入口模块里直接调用 `dotenv.config()`
 * 晚于 `src/lib/db/client.ts` 构造 PrismaPg。把加载 .env.local 做成独立
 * side-effect 模块，并由命令行入口第一个 import，确保 DATABASE_URL 等变量
 * 在数据库客户端、飞书客户端等模块求值前就绪。
 */
import { config } from "dotenv";

config({ path: ".env.local" });
