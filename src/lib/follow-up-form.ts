import { FollowUpMode } from "@/generated/prisma/enums";

/** 把表单中的跟进方式收敛到 FollowUpMode，非法值回退为 OTHER。 */
export function parseFollowUpMode(
  value: FormDataEntryValue | null
): FollowUpMode {
  const raw = String(value ?? "");
  return Object.values(FollowUpMode).includes(raw as FollowUpMode)
    ? (raw as FollowUpMode)
    : FollowUpMode.OTHER;
}

/** 解析表单中的下一步计划跟进时间；空值表示未计划。 */
export function parseNextFollowUpAt(
  value: FormDataEntryValue | null
): Date | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
