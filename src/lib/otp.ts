import { createHash, randomInt } from "crypto";
import { prisma } from "./db";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_WINDOW = 5;
const SEND_WINDOW_MS = 15 * 60 * 1000;

const hash = (code: string) => createHash("sha256").update(code).digest("hex");

export async function issueOtp(
  phone: string
): Promise<{ devCode?: string } | { error: string }> {
  const windowStart = new Date(Date.now() - SEND_WINDOW_MS);
  // Prune only rows outside the window — rows inside it ARE the send counter.
  await prisma.otpCode.deleteMany({ where: { phone, createdAt: { lt: windowStart } } });
  const recent = await prisma.otpCode.count({ where: { phone } });
  if (recent >= MAX_SENDS_PER_WINDOW) {
    return { error: "Too many codes requested. Please wait a few minutes." };
  }
  const code = randomInt(100000, 1000000).toString();
  await prisma.otpCode.create({
    data: { phone, codeHash: hash(code), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });
  const devCode = await sendOtp(phone, code);
  return { devCode };
}

/**
 * Dev-mode SMS stub — the single swap point for a real provider
 * (Supabase Auth + Twilio/MSG91 later, see DECISIONS.md D2).
 * Returns the code so the UI can show it; returns undefined in production.
 */
async function sendOtp(phone: string, code: string): Promise<string | undefined> {
  console.log(`[growline] OTP for ${phone}: ${code}`);
  if (process.env.NODE_ENV !== "production" || process.env.DEV_OTP_ECHO === "1") {
    return code;
  }
  return undefined;
}

export async function verifyOtp(
  phone: string,
  code: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await prisma.otpCode.findFirst({
    where: { phone },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { ok: false, error: "No code was sent to this number. Tap Resend." };
  if (row.expiresAt < new Date()) return { ok: false, error: "That code has expired. Tap Resend." };
  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: "Too many wrong tries. Tap Resend for a new code." };
  }
  if (hash(code) !== row.codeHash) {
    await prisma.otpCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, error: "That code didn't match. Check and try again." };
  }
  await prisma.otpCode.deleteMany({ where: { phone } });
  return { ok: true };
}
