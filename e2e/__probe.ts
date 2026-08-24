import { readFileSync } from "fs";
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, collection, query, where, setDoc, documentId, or } from "firebase/firestore";

const ROOT = "uid_root";      // top of tree
const ASHA = "uid_asha";      // child of root, shareProspects TRUE
const BHAV = "uid_bhav";      // child of root, shareProspects FALSE
const CHAN = "uid_chan";      // child of asha (grandchild of root)
const OUT  = "uid_out";       // unrelated
const WS   = "ws_1";

let env: RulesTestEnvironment;
let fails = 0;
async function check(name: string, fn: () => Promise<unknown>) {
  try { await fn(); console.log(`  PASS  ${name}`); }
  catch (e) { fails++; console.log(`  FAIL  ${name} :: ${(e as Error).message.split("\n")[0]}`); }
}
const as = (u: string) => env.authenticatedContext(u).firestore();

async function main() {
  env = await initializeTestEnvironment({
    projectId: "growline-probe",
    firestore: { rules: readFileSync("/home/user/GrowLine/firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // Production-shaped user docs (see src/lib/users.ts createUser)
    const base = (extra: Record<string, unknown>) => ({
      phone: "+91", name: "n", photoUrl: null, city: "Bengaluru", referralCode: "X",
      levelName: null, directDownlineCount: 0, plan: "trial", trialEndsAt: null,
      followupPushOn: null, workspaceId: WS, ...extra,
    });
    await setDoc(doc(db, "users", ROOT), base({ uplineId: null, uplinePath: [], shareProspects: false }));
    await setDoc(doc(db, "users", ASHA), base({ uplineId: ROOT, uplinePath: [ROOT], shareProspects: true }));
    await setDoc(doc(db, "users", BHAV), base({ uplineId: ROOT, uplinePath: [ROOT], shareProspects: false }));
    await setDoc(doc(db, "users", CHAN), base({ uplineId: ASHA, uplinePath: [ASHA, ROOT], shareProspects: true }));
    await setDoc(doc(db, "users", OUT),  base({ uplineId: null, uplinePath: [], shareProspects: true, workspaceId: "ws_2" }));

    for (const [owner, n] of [[ASHA, 2], [BHAV, 2], [CHAN, 2], [ROOT, 2]] as [string, number][]) {
      for (let i = 0; i < n; i++) {
        await setDoc(doc(db, "prospects", `${owner}__p${i}`), {
          coachId: owner, coachUplinePath: [], name: "Ramesh", phone: "+9199", stage: "spoken",
          heightCm: 170, weightKg: 70, source: "manual", createdAt: new Date(),
        });
      }
    }
    await setDoc(doc(db, "threads", "t_root_all"),    { senderId: ROOT, scope: "all", body: "b", seenCount: 0, ackCount: 0 });
    await setDoc(doc(db, "threads", "t_root_direct"), { senderId: ROOT, scope: "direct", body: "b", seenCount: 0, ackCount: 0 });
    await setDoc(doc(db, "threads", "t_asha_direct"), { senderId: ASHA, scope: "direct", body: "b", seenCount: 0, ackCount: 0 });
    await setDoc(doc(db, "threads", "t_platform"),    { senderId: "admin", scope: "platform", body: "b", seenCount: 0, ackCount: 0 });
  });

  console.log("\n-- exact client queries (src/components/Realtime*.tsx) --");
  await check("RealtimeProspects: where coachId == me", () =>
    assertSucceeds(getDocs(query(collection(as(ASHA), "prospects"), where("coachId", "==", ASHA)))));
  await check("RealtimeThreads q1: where senderId == me", () =>
    assertSucceeds(getDocs(query(collection(as(ROOT), "threads"), where("senderId", "==", ROOT)))));
  await check("RealtimeThreads q2: where senderId == my direct upline", () =>
    assertSucceeds(getDocs(query(collection(as(ASHA), "threads"), where("senderId", "==", ROOT)))));
  await check("RealtimeThreads q2 for a grandchild (CHAN listening on ASHA)", () =>
    assertSucceeds(getDocs(query(collection(as(CHAN), "threads"), where("senderId", "==", ASHA)))));

  console.log("\n-- P1/P2 mandatory --");
  await check("DENY upline lists non-sharing downline's prospects", () =>
    assertFails(getDocs(query(collection(as(ROOT), "prospects"), where("coachId", "==", BHAV)))));
  await check("DENY upline getDoc on non-sharing downline's prospect", () =>
    assertFails(getDoc(doc(as(ROOT), "prospects", `${BHAV}__p0`))));
  await check("ALLOW upline lists SHARING downline's prospects", () =>
    assertSucceeds(getDocs(query(collection(as(ROOT), "prospects"), where("coachId", "==", ASHA)))));
  await check("DENY unfiltered prospects listing", () =>
    assertFails(getDocs(collection(as(ROOT), "prospects"))));
  await check("DENY prospects listing by coachUplinePath array-contains", () =>
    assertFails(getDocs(query(collection(as(ROOT), "prospects"), where("coachUplinePath", "array-contains", ROOT)))));

  console.log("\n-- adversarial query shapes against the prospects rule --");
  await check("DENY coachId 'in' [me, non-sharing downline]", () =>
    assertFails(getDocs(query(collection(as(ROOT), "prospects"), where("coachId", "in", [ROOT, BHAV])))));
  await check("coachId 'in' [me, SHARING downline]", () =>
    assertSucceeds(getDocs(query(collection(as(ROOT), "prospects"), where("coachId", "in", [ROOT, ASHA])))));
  await check("DENY coachId >= '' range", () =>
    assertFails(getDocs(query(collection(as(ROOT), "prospects"), where("coachId", ">=", "")))));
  await check("DENY coachId != me", () =>
    assertFails(getDocs(query(collection(as(ROOT), "prospects"), where("coachId", "!=", ROOT)))));
  await check("DENY documentId prefix scan", () =>
    assertFails(getDocs(query(collection(as(ROOT), "prospects"), where(documentId(), ">=", `${BHAV}__`)))));
  await check("DENY OR(coachId==me, coachId==nonsharing)", () =>
    assertFails(getDocs(query(collection(as(ROOT), "prospects"),
      or(where("coachId", "==", ROOT), where("coachId", "==", BHAV))))));

  console.log("\n-- threads rule shapes --");
  await check("DENY unfiltered threads listing", () =>
    assertFails(getDocs(collection(as(ASHA), "threads"))));
  await check("DENY grandchild lists grandparent threads w/o scope pin", () =>
    assertFails(getDocs(query(collection(as(CHAN), "threads"), where("senderId", "==", ROOT)))));
  await check("grandchild lists grandparent threads WITH scope=='all'", () =>
    assertSucceeds(getDocs(query(collection(as(CHAN), "threads"),
      where("senderId", "==", ROOT), where("scope", "==", "all")))));
  await check("DENY list scope=='all' with no senderId pin", () =>
    assertFails(getDocs(query(collection(as(CHAN), "threads"), where("scope", "==", "all")))));
  await check("platform list by outsider", () =>
    assertSucceeds(getDocs(query(collection(as(OUT), "threads"), where("scope", "==", "platform")))));
  await check("DENY outsider getDoc on a coach's 'all' thread", () =>
    assertFails(getDoc(doc(as(OUT), "threads", "t_root_all"))));
  await check("DENY sibling reads sibling's direct thread", () =>
    assertFails(getDoc(doc(as(BHAV), "threads", "t_asha_direct"))));

  console.log("\n-- fail-closed on missing/absent data --");
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // A coach whose user doc has NO shareProspects field at all
    await setDoc(doc(db, "users", "uid_nofield"), { name: "x", uplineId: ROOT, uplinePath: [ROOT] });
    await setDoc(doc(db, "prospects", "uid_nofield__p0"), { coachId: "uid_nofield", name: "R", phone: "+91" });
    // A prospect whose coach user doc does not exist at all
    await setDoc(doc(db, "prospects", "ghost__p0"), { coachId: "uid_ghost", name: "R", phone: "+91" });
  });
  await check("DENY upline reads prospects of coach with NO shareProspects field", () =>
    assertFails(getDocs(query(collection(as(ROOT), "prospects"), where("coachId", "==", "uid_nofield")))));
  await check("DENY read prospect whose coach user doc is missing", () =>
    assertFails(getDoc(doc(as(ROOT), "prospects", "ghost__p0"))));
  await check("owner of a prospect whose OWN user doc is missing can still read it", () =>
    assertSucceeds(getDocs(query(collection(as("uid_ghost"), "prospects"), where("coachId", "==", "uid_ghost")))));

  console.log("\n-- collections with no rule / denied collections --");
  for (const c of ["users", "dailyLogs", "targets", "reports", "recognitions", "wallPrefs",
                   "tiers", "subscriptions", "portfolios", "promoCodes", "fcmTokens",
                   "threadReceipts", "referralCodes", "silenceAlerts", "qualificationProgress"]) {
    await check(`DENY list ${c}`, () => assertFails(getDocs(collection(as(ROOT), c))));
  }

  console.log(fails === 0 ? "\nALL PROBES BEHAVED AS EXPECTED" : `\n${fails} probe(s) deviated`);
  await env.cleanup();
}
main();
