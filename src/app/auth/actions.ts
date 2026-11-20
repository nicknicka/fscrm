"use server";

import { redirect } from "next/navigation";
import { clearSession } from "@/lib/auth/session";

/** 退出登录：清除服务端会话后返回可重新授权的登录入口。 */
export async function logout() {
  await clearSession();
  redirect("/login");
}
