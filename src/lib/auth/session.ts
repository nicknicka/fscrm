import { cookies } from "next/headers";

/**
 * 服务端会话。
 *
 * 会话载荷只保存当前负责人 ID、姓名与角色，并用独立密钥签名；
 * Cookie 只由服务端读写，后续页面与 Server Action 通过 `getCurrentUser()`
 * 取得统一的权限上下文。
 */

/** 当前负责人角色：普通负责人或管理员。 */
export type UserRole = "OWNER" | "ADMIN";

/** 会话中保存的当前负责人。 */
export interface CurrentUser {
  id: string;
  name: string;
  role: UserRole;
}

/** 会话载荷。 */
export interface SessionPayload extends CurrentUser {
  /** 过期时间（Unix 秒）。 */
  exp: number;
}

/** 会话 Cookie 名称。 */
export const SESSION_COOKIE_NAME = "fscrm_session";

/** 会话有效期：7 天（秒）。 */
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const encoder = new TextEncoder();

function base64UrlEncode(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function getSessionKey(): Uint8Array<ArrayBuffer> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET 未配置或长度不足 32 个字符；请使用独立会话密钥。"
    );
  }
  const encoded = encoder.encode(secret);
  return Uint8Array.from(encoded);
}

async function sign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    getSessionKey(),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return base64UrlEncode(new Uint8Array(signature));
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }
  let mismatch = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    mismatch |= leftBytes[index] ^ rightBytes[index];
  }
  return mismatch === 0;
}

/**
 * 为当前负责人签发防篡改会话令牌。
 */
export async function signSession(user: CurrentUser): Promise<string> {
  const payload: SessionPayload = {
    id: user.id,
    name: user.name,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = base64UrlEncode(
    encoder.encode(JSON.stringify(payload))
  );
  const signature = await sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

/**
 * 校验会话令牌签名、有效期与载荷结构；无效会话返回 null。
 */
export async function verifySession(
  token: string | undefined
): Promise<CurrentUser | null> {
  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [encodedPayload, signature] = parts;
  const expectedSignature = await sign(encodedPayload);
  if (!timingSafeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(encodedPayload))
    ) as Partial<SessionPayload>;
    if (
      typeof payload.id !== "string" ||
      typeof payload.name !== "string" ||
      (payload.role !== "OWNER" && payload.role !== "ADMIN") ||
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return { id: payload.id, name: payload.name, role: payload.role };
  } catch {
    return null;
  }
}

/** 会话 Cookie 的公共属性。 */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/**
 * 签发会话并写入 HttpOnly Cookie。
 * 供后续登录回调等 Route Handler 或 Server Action 调用。
 */
export async function createSession(user: CurrentUser): Promise<void> {
  const token = await signSession(user);
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    ...sessionCookieOptions(),
  });
}

/** 退出登录：清除会话 Cookie。 */
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * 受保护入口统一读取当前负责人与角色。
 * 未登录、会话过期或会话无效时返回 null，不提供任何业务数据。
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  return verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

/**
 * 受保护入口守卫：未登录时返回明确的未登录结果。
 */
export async function requireCurrentUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }
  return user;
}
