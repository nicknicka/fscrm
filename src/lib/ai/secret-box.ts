import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/**
 * 模型 API Key 的静态加密。
 *
 * 密钥不新增环境变量：用 `SESSION_SECRET` 经 SHA-256 派生成 32 字节 AES 密钥，
 * 这样已有部署无需额外配置即可使用。密文格式为
 * `v1.<iv-base64url>.<tag-base64url>.<ciphertext-base64url>`，版本前缀留给
 * 未来轮换算法。
 *
 * 只用于存储服务商 Key；会话令牌仍由 HMAC 独立签名，二者不共用同一用途的密钥。
 */

const VERSION = "v1";

function derivedKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET 未配置或长度不足 32 个字符，无法加密模型 API Key。"
    );
  }
  // 用途隔离：加后缀派生，避免与会话签名的密钥完全等价。
  return createHash("sha256").update(`fscrm:model-api-key:${secret}`).digest();
}

/** 加密明文 API Key，返回可入库的密文字符串。 */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/**
 * 解密 API Key。
 *
 * 密文损坏或密钥变更时抛出错误——调用方据此把配置视为不可用，
 * 而不是拿一段乱码去请求服务商。
 */
export function decryptSecret(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("API Key 密文格式无法识别。");
  }
  const [, ivPart, tagPart, dataPart] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    derivedKey(),
    Buffer.from(ivPart, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** 生成用于界面展示的掩码，如 `sk-…a1b2`。 */
export function maskSecret(plain: string): string {
  if (plain.length <= 8) return "****";
  return `${plain.slice(0, 3)}…${plain.slice(-4)}`;
}
