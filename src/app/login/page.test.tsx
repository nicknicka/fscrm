import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import LoginPage from "./page";

async function renderLoginPage(error?: string | string[]) {
  return renderToStaticMarkup(
    await LoginPage({
      searchParams: Promise.resolve(error === undefined ? {} : { error }),
    })
  );
}

describe("飞书 CRM 登录页", () => {
  it("始终提供飞书登录入口，便于换个账号重新授权", async () => {
    const html = await renderLoginPage();

    expect(html).toContain('href="/api/auth/feishu/login"');
    expect(html).toContain("使用飞书登录");
  });

  it("没有错误码时不打扰用户，不显示任何提示", async () => {
    const html = await renderLoginPage();

    expect(html).not.toContain('role="alert"');
  });

  it("不在登录页展示业务数据入口", async () => {
    const html = await renderLoginPage();

    expect(html).not.toMatch(/客户|线索|商机|跟进记录/);
  });
});
