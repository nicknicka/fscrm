/**
 * 飞书事件订阅长连接启动入口。
 *
 * 运行：npm run feishu:events
 *
 * 该进程启动后会与飞书开放平台建立 WebSocket 长连接，
 * 接收事件（当前订阅 im.message.receive_v1）并按注册的事件处理器分发。
 * 需要在飞书开放平台配置「使用长连接接收事件」并订阅对应事件。
 */
// 必须最先求值：加载 .env.local 后，后续 import 的客户端模块才能拿到环境变量。
import "./env-bootstrap";

import { startFeishuEvents } from "../src/lib/feishu/events/connection";
import { prisma } from "../src/lib/db/client";

function main() {
  console.log("[fscrm] 正在启动飞书事件长连接...");

  let wsClient;
  try {
    wsClient = startFeishuEvents();
  } catch (error) {
    // 凭证未配置等错误：给出清晰提示后退出
    console.error("[fscrm] 启动失败:", error);
    process.exit(1);
  }

  console.log("[fscrm] 长连接已启动，等待飞书事件推送（Ctrl+C 退出）");

  // 优雅退出：关闭长连接与数据库连接
  const shutdown = async () => {
    console.log("\n[fscrm] 正在关闭...");
    try {
      wsClient.close();
    } catch {
      // 忽略关闭异常
    }
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
