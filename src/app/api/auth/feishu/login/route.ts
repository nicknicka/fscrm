import { type NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { isFeishuConfigured } from "@/lib/feishu/client";
import { buildAuthorizeUrl } from "@/lib/feishu/identity/oauth";
import { normalizeSafeRedirectPath } from "@/lib/auth/redirect";

/** OAuth 入口生成的一次性 state Cookie 名称。 */
export const OAUTH_STATE_COOKIE_NAME = "fscrm_oauth_state";

/** state Cookie 有效期（秒）。 */
const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

function loginError(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

/**
 * 浏览器侧飞书 OAuth 入口：生成一次性 state，并把用户带到飞书授权页。
 */
export async function GET(request: NextRequest) {
  if (!isFeishuConfigured()) {
    return loginError(
      400,
      "config_missing",
      "飞书应用凭证未配置：请设置 FEISHU_APP_ID 与 FEISHU_APP_SECRET。"
    );
  }

  const appId = process.env.FEISHU_APP_ID;
  const redirectUri = process.env.FEISHU_OAUTH_REDIRECT_URI;
  if (!appId || !redirectUri) {
    return loginError(
      400,
      "config_missing",
      "飞书 OAuth 未配置：请设置 FEISHU_APP_ID 与 FEISHU_OAUTH_REDIRECT_URI。"
    );
  }

  const state = randomBytes(32).toString("base64url");
  const authorizeUrl = buildAuthorizeUrl({
    appId,
    redirectUri,
    scope: process.env.FEISHU_OAUTH_SCOPE,
    state,
    domain: process.env.FEISHU_APP_DOMAIN,
  });

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set({
    name: OAUTH_STATE_COOKIE_NAME,
    value: state,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/feishu/callback",
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  });

  const requestedNext = request.nextUrl.searchParams.get("next");
  const nextPath = normalizeSafeRedirectPath(requestedNext) ?? "/";
  response.cookies.set({
    name: "fscrm_oauth_next",
    value: nextPath,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/feishu/callback",
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  });

  return response;
}
