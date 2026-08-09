/**
 * Builds a representative dev.db to migrate FROM.
 *
 * The container clones without a database (dev.db is gitignored), so there would
 * otherwise be nothing to test the migration against — and a migration verified
 * against zero rows is not verified. This seeds the shapes that actually stress
 * the migration: a three-level tree, a prospect captured offline (clientId set)
 * next to one from a QR self-fill (clientId null), a report with a real token,
 * logs across a month boundary, and a target with a proof attached.
 *
 *   npx tsx scripts/seed-sqlite.ts
 */
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { createHash, randomUUID } from "crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { APP_TIMEZONE, dayKey, startOfDayInZone } from "../src/lib/day";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" }),
});

const NOW = new Date("2026-08-09T12:00:00Z");
const monthKey = dayKey(NOW, APP_TIMEZONE).slice(0, 7);

async function main() {
  // Order matters: children reference parents.
  await prisma.proof.deleteMany();
  await prisma.target.deleteMany();
  await prisma.report.deleteMany();
  await prisma.prospect.deleteMany();
  await prisma.dailyLog.deleteMany();
  await prisma.pushSubscription.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.user.deleteMany();

  const mk = async (
    id: string,
    name: string,
    phone: string,
    code: string,
    uplineId: string | null,
    shareProspects = false
  ) =>
    prisma.user.create({
      data: {
        id,
        name,
        phone,
        referralCode: code,
        uplineId,
        shareProspects,
        city: "Bengaluru",
        plan: "trial",
        trialEndsAt: new Date("2026-10-08T00:00:00Z"),
        createdAt: NOW,
      },
    });

  // Three levels. `asha` shares prospects, `bhavana` does not — the pair the
  // mandatory privacy-rule test in v2.1b needs.
  const root = await mk("usr_root0000000000000000", "Root Coach", "+919000000001", "ROOT01", null);
  const asha = await mk("usr_asha0000000000000000", "Asha", "+919000000002", "ASHA01", root.id, true);
  const bhav = await mk("usr_bhav0000000000000000", "Bhavana", "+919000000003", "BHAV01", root.id, false);
  const chan = await mk("usr_chan0000000000000000", "Chandan", "+919000000004", "CHAN01", asha.id);

  // Two capture paths: offline queue (clientId set, D6) and QR self-fill (null).
  const queued = await prisma.prospect.create({
    data: {
      id: "prs_queued000000000000000",
      coachId: asha.id,
      clientId: randomUUID(),
      name: "Meera",
      phone: "+919111111101",
      age: 34,
      gender: "female",
      heightCm: 160,
      weightKg: 68,
      stage: "interested",
      source: "manual",
      nextFollowupAt: new Date("2026-08-11T04:00:00Z"),
      createdAt: NOW,
    },
  });
  await prisma.prospect.create({
    data: {
      id: "prs_qrfill000000000000000",
      coachId: asha.id,
      clientId: null,
      name: "Ravi",
      phone: "+919111111102",
      stage: "spoken",
      source: "qr",
      createdAt: NOW,
    },
  });
  await prisma.prospect.create({
    data: {
      id: "prs_bhavana0000000000000",
      coachId: bhav.id,
      clientId: null,
      name: "Sunita",
      phone: "+919111111103",
      stage: "member",
      source: "manual",
      createdAt: NOW,
    },
  });

  const metrics = JSON.stringify({ v: 1, bmi: 26.6, band: "above" });
  await prisma.report.create({
    data: {
      id: "rpt_0000000000000000000",
      prospectId: queued.id,
      token: "Xk7mQp2RtY9wLb4NcF6vHs3JdG8zA5eU",
      metricsJson: metrics,
      inputsHash: createHash("sha256").update(metrics).digest("hex").slice(0, 32),
      createdAt: NOW,
    },
  });

  // Logs on both sides of a month boundary — D26's whole point.
  for (const key of ["2026-07-31", "2026-08-01", "2026-08-08", "2026-08-09"]) {
    for (const u of [asha, chan]) {
      await prisma.dailyLog.create({
        data: {
          userId: u.id,
          logDate: startOfDayInZone(key, APP_TIMEZONE),
          servings: 3,
          memberships: key === "2026-08-09" ? 1 : 0,
          sessions: 1,
          invites: 4,
          followupsDone: 2,
          createdAt: NOW,
        },
      });
    }
  }

  const target = await prisma.target.create({
    data: {
      id: "tgt_0000000000000000000",
      coachId: asha.id,
      setById: root.id,
      month: monthKey,
      targetPoints: 400,
      progressPoints: 420,
      status: "active", // deliberately stale — D31 derives achievement from numbers
      createdAt: NOW,
      updatedAt: NOW,
    },
  });

  await prisma.proof.create({
    data: {
      id: "prf_0000000000000000000",
      targetId: target.id,
      requestedById: root.id,
      requestNote: "Send a photo of the session register.",
      status: "submitted",
      submitNote: "Attached.",
      mediaUrl: "data:image/jpeg;base64,/9j/PLACEHOLDER",
      createdAt: NOW,
      submittedAt: NOW,
    },
  });

  // An OTP row, to prove the migration drops it rather than carrying it over.
  await prisma.otpCode.create({
    data: { phone: "+919000000002", codeHash: "deadbeef", expiresAt: NOW },
  });

  const counts = {
    users: await prisma.user.count(),
    prospects: await prisma.prospect.count(),
    reports: await prisma.report.count(),
    dailyLogs: await prisma.dailyLog.count(),
    targets: await prisma.target.count(),
    proofs: await prisma.proof.count(),
    otpCodes: await prisma.otpCode.count(),
  };
  console.log("Seeded:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
