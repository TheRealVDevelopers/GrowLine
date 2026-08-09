import { randomInt } from "crypto";
import { prisma } from "./db";

// No 0/O/1/I — codes get read aloud and typed on cheap keyboards.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function generateReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) code += ALPHABET[randomInt(ALPHABET.length)];
    const exists = await prisma.user.findUnique({ where: { referralCode: code } });
    if (!exists) return code;
  }
  throw new Error("Could not generate a unique referral code");
}
