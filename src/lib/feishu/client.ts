import * as lark from "@larksuiteoapi/node-sdk";

/**
 * 飞书开放平台客户端封装。
 *
 * 凭证来自环境变量（见仓库根目录 `.env.example`）：
 * - `FEISHU_APP_ID` / `FEISHU_APP_SECRET`：应用凭证，缺失时无法调用接口
 * - `FEISHU_APP_DOMAIN`：飞书为 `https://open.feishu.cn`，Lark 为
 *   `https://open.larksuite.com`；含 `larksuite` 时使用 Lark 域
 *
 * 凭证读取采用「按需读取」而非模块加载时固化，便于测试与多环境切换。
 */

/** 凭证是否已配置，用于在调用前做前置判断。 */
export function isFeishuConfigured(): boolean {
  return Boolean(process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET);
}

let cachedClient: lark.Client | null = null;

/**
 * 返回共享的飞书 OpenAPI 客户端实例（进程内单例，复用令牌缓存）。
 *
 * 凭证未配置时调用会抛出错误；调用前请先通过 `isFeishuConfigured()` 判断。
 */
export function getFeishuClient(): lark.Client {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error(
      "飞书凭证未配置：请设置 FEISHU_APP_ID 与 FEISHU_APP_SECRET（见 .env.example）。"
    );
  }

  if (!cachedClient) {
    const appDomain = process.env.FEISHU_APP_DOMAIN;
    const domain =
      appDomain && appDomain.includes("larksuite")
        ? lark.Domain.Lark
        : lark.Domain.Feishu;

    cachedClient = new lark.Client({
      appId,
      appSecret,
      appType: lark.AppType.SelfBuild,
      domain,
    });
  }

  return cachedClient;
}
