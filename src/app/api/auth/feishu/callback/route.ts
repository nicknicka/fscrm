import { type NextRequest, NextResponse } from "next/server";
import { isFeishuConfigured } from "@/lib/feishu/client";
import { authenticateWithCode } from "@/lib/feishu/identity/service";
import { createDbPersonLookup } from "@/lib/db/feishu-binding";
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  signSession,
} from "@/lib/auth/session";
import { UserRole } from "@/generated/prisma/enums";
import { normalizeSafeRedirectPath } from "@/lib/auth/redirect";
import { consumeOAuthState } from "@/lib/auth/oauth-state";

/**
 * 飞书 OAuth 回调入口：一次性校验 state（共享存储，见 #46），兑换授权码并匹配 CRM 负责人。
 *
 * 只有匹配成功后才签发服务端会话；任何失败都跳转回登录页并带明确错误码。
 */

const OAUTH_STATE_COOKIE_NAME = "fscrm_oauth_state";
const OAUTH_NEXT_COOKIE_NAME = "fscrm_oauth_next";

function loginRedirect(request: NextRequest, error: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

function clearCookie(response: NextResponse, name: string) {
  response.cookies.set({
    name,
    value: "",
    path: "/api/auth/feishu/callback",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

function safeNext(request: NextRequest): string {
  return normalizeSafeRedirectPath(request.cookies.get(OAUTH_NEXT_COOKIE_NAME)?.value) ?? "/";
}

function isSessionConfigured(): boolean {
  const secret = process.env.SESSION_SECRET;
  return Boolean(secret && secret.length >= 32);
}

function isConfigError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("未配置") ||
      error.message.includes("SESSION_SECRET") ||
      error.message.includes("FEISHU_APP"))
  );
}

/**
 * 处理飞书授权回调。
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const feishuError = params.get("error");
  const stateFromQuery = params.get("state");
  const stateFromCookie = request.cookies.get(OAUTH_STATE_COOKIE_NAME)?.value;

  if (feishuError) {
    const mapped = feishuError.toLowerCase();
    const error =
      mapped.includes("cancel") || mapped.includes("denied")
        ? "cancelled"
        : "denied";
    const response = loginRedirect(request, error);
    clearCookie(response, OAUTH_STATE_COOKIE_NAME);
    return response;
  }

  if (!stateFromCookie || !stateFromQuery || stateFromCookie !== stateFromQuery) {
    const response = loginRedirect(request, "invalid_state");
    clearCookie(response, OAUTH_STATE_COOKIE_NAME);
    return response;
  }

  // 一次性消费走共享存储（#46）：多实例部署下重放同一 state 同样被拒绝，
  // 进程重启也不会让旧 state 重新可用。
  if (!(await consumeOAuthState(stateFromQuery))) {
    const response = loginRedirect(request, "invalid_state");
    clearCookie(response, OAUTH_STATE_COOKIE_NAME);
    return response;
  }

  if (!isFeishuConfigured() || !isSessionConfigured()) {
    const response = loginRedirect(request, "config_missing");
    clearCookie(response, OAUTH_STATE_COOKIE_NAME);
    return response;
  }

  const code = params.get("code");
  if (!code) {
    return NextResponse.json(
      { error: "missing_code", message: "授权回调缺少授权码。" },
      { status: 400 }
    );
  }

  try {
    const result = await authenticateWithCode(code, createDbPersonLookup());
    if (result.match.status !== "matched" || !result.match.person?.id) {
      const response = loginRedirect(request, "unbound");
      clearCookie(response, OAUTH_STATE_COOKIE_NAME);
      return response;
    }

    const person = result.match.person;
    const token = await signSession({
      id: person.id,
      name: person.name ?? result.auth.user.name ?? "",
      role: person.role ?? UserRole.OWNER,
    });

    const destination = new URL(safeNext(request), request.url);
    const response = NextResponse.redirect(destination);
    clearCookie(response, OAUTH_STATE_COOKIE_NAME);
    clearCookie(response, OAUTH_NEXT_COOKIE_NAME);
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      ...sessionCookieOptions(),
    });
    return response;
  } catch (error) {
    const response = loginRedirect(
      request,
      isConfigError(error) ? "config_missing" : "auth_failed"
    );
    clearCookie(response, OAUTH_STATE_COOKIE_NAME);
    return response;
  }
}
