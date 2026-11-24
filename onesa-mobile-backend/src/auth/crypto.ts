import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
export const randomToken = (): string => randomBytes(32).toString("base64url");

export function constantEqual(left: string, right: string): boolean {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 14 || password.length > 256) throw new Error("Password must have between 14 and 256 characters.");
  const salt = randomBytes(16).toString("hex");
  const key = await new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, derived) => error ? reject(error) : resolve(derived)));
  return "scrypt$32768$8$1$" + salt + "$" + key.toString("hex");
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (password.length > 256 || parts.length !== 6 || parts[0] !== "scrypt" ||
      parts[1] !== "32768" || parts[2] !== "8" || parts[3] !== "1" ||
      !/^[a-f0-9]{32}$/.test(parts[4] ?? "") || !/^[a-f0-9]{64}$/.test(parts[5] ?? "")) return false;
  const key = await new Promise<Buffer>((resolve, reject) =>
    scrypt(password, parts[4]!, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, derived) => error ? reject(error) : resolve(derived)));
  return constantEqual(key.toString("hex"), parts[5]!);
}

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function encodeBase32(bytes: Uint8Array): string {
  let bits = 0, value = 0, output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { output += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}
export function decodeBase32(secret: string): Buffer {
  if (!/^[A-Z2-7]{32}$/.test(secret)) throw new Error("Invalid authenticator seed.");
  let value = 0, bits = 0;
  const result: number[] = [];
  for (const character of secret) {
    value = (value << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) { result.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(result);
}
export const newTotpSecret = (): string => encodeBase32(randomBytes(20));
export function totpAt(secret: string, unixSeconds: number): string {
  const counter = BigInt(Math.floor(unixSeconds / 30));
  const input = Buffer.alloc(8);
  input.writeBigUInt64BE(counter);
  const mac = createHmac("sha1", decodeBase32(secret)).update(input).digest();
  const offset = mac[mac.length - 1]! & 15;
  const value = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, "0");
}
/** The exact accepted step is consumed atomically by the store; it is never reusable. */
export function totpStep(secret: string, code: string, unixSeconds: number, previousStep: number): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(unixSeconds / 30);
  for (const step of [current, current - 1, current + 1]) {
    if (step > previousStep && step >= 0 && constantEqual(totpAt(secret, step * 30), code)) return step;
  }
  return null;
}

export function seal(value: string, key: Buffer): string {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return "v1." + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
export function unseal(value: string, key: Buffer): string {
  if (!/^v1\.[A-Za-z0-9_-]+$/.test(value)) throw new Error("Encrypted authentication state rejected.");
  const body = Buffer.from(value.slice(3), "base64url");
  if (body.length < 29) throw new Error("Encrypted authentication state rejected.");
  const decipher = createDecipheriv("aes-256-gcm", key, body.subarray(0, 12));
  decipher.setAuthTag(body.subarray(12, 28));
  return Buffer.concat([decipher.update(body.subarray(28)), decipher.final()]).toString("utf8");
}
