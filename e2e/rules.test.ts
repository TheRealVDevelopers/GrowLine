/**
 * Security Rules tests.
 *
 * BUILD_PROMPT_V2 §5.7: "Security Rules tests — upline CANNOT read prospects when
 * toggle is off (this test is mandatory)."
 *
 * These run against the Firestore emulator with the rules file loaded, using real
 * authenticated clients. They exist because the UI hiding something proves nothing
 * — the question is what a hand-written query gets back.
 *
 *   npm run test:rules
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { doc, getDoc, getDocs, collection, query, where, setDoc } from "firebase/firestore";

const ROOT = "usr_root";
const ASHA = "usr_asha"; // shareProspects: true
const BHAV = "usr_bhav"; // shareProspects: false
const CHAN = "usr_chan"; // Asha's downline
const OUTSIDER = "usr_outsider";

let env: RulesTestEnvironment;
let failures = 0;
let passes = 0;

async function check(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    passes++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failures++;
    console.log(`  FAIL  ${name} — ${(e as Error).message.split("\n")[0]}`);
  }
}

/**
 * Canary for the scale section: proves this harness still counts document lookups
 * at all.
 *
 * Without it, "26 documents still pass" could equally mean the emulator stopped
 * enforcing the budget, and the check above would be a vacuous green. These three
 * pin the ceilings the real rule lives under, using a throwaway ruleset — the real
 * rules have no way to spend that many lookups, which is the point.
 *
 * Measured here: a single-document read allows 10 distinct lookups and refuses 11;
 * a query refuses 21. (The emulator actually allows 20 for a query, but the docs
 * say 10 for both, so that ceiling is deliberately not asserted — the rule budgets
 * against 10 and this must not go red if the emulator ever aligns with the docs.)
 */
async function checkLookupBudgetIsEnforced() {
  const lookups = (n: number) =>
    Array.from(
      { length: n },
      (_, i) => `get(/databases/$(database)/documents/canary/d_${i}).data.ok == true`
    ).join(" && ");

  const budget = await initializeTestEnvironment({
    projectId: "growline-rules-budget",
    firestore: {
      rules: `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /overQuery/{id}  { allow read: if ${lookups(21)}; }
    match /overSingle/{id} { allow read: if ${lookups(11)}; }
    match /underBoth/{id}  { allow read: if ${lookups(10)}; }
    match /{document=**}   { allow read, write: if false; }
  }
}`,
      host: "127.0.0.1",
      port: 8080,
    },
  });

  await budget.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (let i = 0; i < 21; i++) await setDoc(doc(db, "canary", `d_${i}`), { ok: true });
    for (const c of ["overQuery", "overSingle", "underBoth"]) {
      await setDoc(doc(db, c, "x"), { n: 1 });
    }
  });

  const db = budget.authenticatedContext(ROOT).firestore();
  await check("canary: 21 distinct lookups in a query rule is over budget", () =>
    assertFails(getDocs(collection(db, "overQuery")))
  );
  await check("canary: 11 distinct lookups in a single-document rule is over budget", () =>
    assertFails(getDoc(doc(db, "overSingle", "x")))
  );
  await check("canary: 10 distinct lookups is inside both budgets", () =>
    assertSucceeds(getDoc(doc(db, "underBoth", "x")))
  );
  await budget.cleanup();
}

async function main() {
  env = await initializeTestEnvironment({
    projectId: "growline-rules-test",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });

  // Seed with rules disabled — this is fixture setup, not a thing under test.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", ROOT), {
      name: "Root", uplineId: null, uplinePath: [], shareProspects: false,
    });
    await setDoc(doc(db, "users", ASHA), {
      name: "Asha", uplineId: ROOT, uplinePath: [ROOT], shareProspects: true,
    });
    await setDoc(doc(db, "users", BHAV), {
      name: "Bhavana", uplineId: ROOT, uplinePath: [ROOT], shareProspects: false,
    });
    await setDoc(doc(db, "users", CHAN), {
      name: "Chandan", uplineId: ASHA, uplinePath: [ASHA, ROOT], shareProspects: false,
    });
    await setDoc(doc(db, "users", OUTSIDER), {
      name: "Outsider", uplineId: null, uplinePath: [], shareProspects: true,
    });

    await setDoc(doc(db, "prospects", "p_asha"), {
      coachId: ASHA, coachUplinePath: [ROOT], name: "Meera", phone: "+919111111101",
    });
    await setDoc(doc(db, "prospects", "p_bhav"), {
      coachId: BHAV, coachUplinePath: [ROOT], name: "Sunita", phone: "+919111111103",
    });
    await setDoc(doc(db, "dailyLogs", "l_bhav"), {
      userId: BHAV, uplinePath: [ROOT], dayKey: "2026-08-09", servings: 3,
    });
    await setDoc(doc(db, "proofs", "pr_1"), {
      targetId: "t1", coachId: ASHA, requestedById: ROOT, status: "submitted",
    });
    await setDoc(doc(db, "reports", "r_1"), {
      prospectId: "p_asha", coachId: ASHA, token: "tok", metricsJson: "{}",
    });
  });

  const as = (uid: string) => env.authenticatedContext(uid).firestore();
  const anon = () => env.unauthenticatedContext().firestore();

  console.log("\nSecurity Rules\n");

  // ---- THE MANDATORY ONE ----------------------------------------------------
  await check(
    "MANDATORY: upline CANNOT read a downline's prospect while the toggle is off",
    () => assertFails(getDoc(doc(as(ROOT), "prospects", "p_bhav")))
  );
  await check(
    "MANDATORY: nor by querying — the list path is closed too",
    () =>
      assertFails(
        getDocs(query(collection(as(ROOT), "prospects"), where("coachId", "==", BHAV)))
      )
  );

  // ---- The toggle actually toggles ------------------------------------------
  // These two carry a second job since /users was closed to clients: they prove the
  // privacy rule's `get()` on that collection still resolves, because a `get()`
  // inside a rule is not subject to the rules. If they ever fail together while the
  // MANDATORY pair above still passes, suspect that, not the toggle.
  await check("upline CAN read a downline's prospect when the toggle is ON", () =>
    assertSucceeds(getDoc(doc(as(ROOT), "prospects", "p_asha")))
  );
  await check("...and via a query filtered to that one coach", () =>
    assertSucceeds(
      getDocs(query(collection(as(ROOT), "prospects"), where("coachId", "==", ASHA)))
    )
  );

  // ---- Ownership and outsiders ----------------------------------------------
  await check("a coach reads their own prospect", () =>
    assertSucceeds(getDoc(doc(as(ASHA), "prospects", "p_asha")))
  );
  await check("a sibling cannot read a prospect, toggle or not", () =>
    assertFails(getDoc(doc(as(BHAV), "prospects", "p_asha")))
  );
  await check("a downline cannot read their UPLINE's prospects", () =>
    assertFails(getDoc(doc(as(CHAN), "prospects", "p_asha")))
  );
  await check("a stranger cannot read a sharing coach's prospect", () =>
    assertFails(getDoc(doc(as(OUTSIDER), "prospects", "p_asha")))
  );
  await check("an unauthenticated client cannot read prospects at all", () =>
    assertFails(getDoc(doc(anon(), "prospects", "p_asha")))
  );
  await check("an unfiltered listing of all prospects is refused", () =>
    assertFails(getDocs(collection(as(ROOT), "prospects")))
  );

  // ---- Activity counts DO flow up, regardless of the toggle ------------------
  await check(
    "activity flows up even with the toggle OFF — the accountability loop survives",
    () => assertSucceeds(getDoc(doc(as(ROOT), "dailyLogs", "l_bhav")))
  );
  await check("a sibling still cannot read another's daily log", () =>
    assertFails(getDoc(doc(as(ASHA), "dailyLogs", "l_bhav")))
  );

  // ---- Users are server-only -------------------------------------------------
  // No browser code reads this collection — the team tree is built by the Admin
  // SDK. Rules cannot grant single fields, so any read allowed here is the WHOLE
  // document: phone, referralCode, plan, trialEndsAt, and shareProspects itself.
  // These three are what stops that being reopened for the sake of a name and a
  // photo; the fix they lock in is in the /users comment in firestore.rules.
  await check("an upline CANNOT read a downline's user document", () =>
    assertFails(getDoc(doc(as(ROOT), "users", CHAN)))
  );
  await check("nor can a coach read their own", () =>
    assertFails(getDoc(doc(as(ASHA), "users", ASHA)))
  );
  await check("a stranger certainly cannot", () =>
    assertFails(getDoc(doc(as(OUTSIDER), "users", ASHA)))
  );

  // ---- Proofs are for the two people in the exchange -------------------------
  await check("the coach reads their own proof", () =>
    assertSucceeds(getDoc(doc(as(ASHA), "proofs", "pr_1")))
  );
  await check("the upline who asked reads it", () =>
    assertSucceeds(getDoc(doc(as(ROOT), "proofs", "pr_1")))
  );
  await check("nobody else does", () =>
    assertFails(getDoc(doc(as(BHAV), "proofs", "pr_1")))
  );

  // ---- Reports are server-only (D17: the token is the access control) --------
  await check("reports are unreadable by any client, even the owning coach", () =>
    assertFails(getDoc(doc(as(ASHA), "reports", "r_1")))
  );

  // ---- No client writes anywhere ---------------------------------------------
  await check("a coach cannot write their own user document", () =>
    assertFails(setDoc(doc(as(ASHA), "users", ASHA), { name: "Hacked" }))
  );
  await check("a coach cannot grant themselves an uplinePath", () =>
    assertFails(setDoc(doc(as(OUTSIDER), "users", OUTSIDER), { uplinePath: [ROOT] }))
  );
  await check("a coach cannot write a prospect directly", () =>
    assertFails(setDoc(doc(as(ASHA), "prospects", "p_new"), { coachId: ASHA }))
  );

  // ---- Scale: the coach lookup is charged per request, not per document -------
  /**
   * Everything above ran against a one-prospect-per-coach fixture, and a
   * one-document fixture cannot tell you what the privacy rule's `get()` costs.
   * Read the rule as "runs once per returned document" and you conclude the shared
   * listing starts failing somewhere around ten prospects — a coach's first week.
   * It does not: a query is evaluated once, against its own constraints, so the
   * single bound `coachId` resolves one `/users` document however many prospects
   * come back. See the accounting note on the prospects rule.
   *
   * 26 documents is well past where the per-document reading predicts
   * permission-denied, and the mandatory denial is re-run at the same size — a
   * cheap fix for a cap that does not exist would be to move the toggle out of the
   * rules and into query constraints, and this is the check that would catch it.
   */
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (let i = 0; i < 25; i++) {
      await setDoc(doc(db, "prospects", `bulk_asha_${i}`), {
        coachId: ASHA, coachUplinePath: [ROOT],
        name: `Asha prospect ${i}`, phone: `+9192222${String(i).padStart(5, "0")}`,
      });
      await setDoc(doc(db, "prospects", `bulk_bhav_${i}`), {
        coachId: BHAV, coachUplinePath: [ROOT],
        name: `Bhavana prospect ${i}`, phone: `+9193333${String(i).padStart(5, "0")}`,
      });
    }
  });

  await check("a 26-document shared listing still passes — one lookup, not one per row", () =>
    assertSucceeds(
      getDocs(query(collection(as(ROOT), "prospects"), where("coachId", "==", ASHA)))
    )
  );
  await check("MANDATORY at scale: 26 documents with the toggle off are still refused", () =>
    assertFails(
      getDocs(query(collection(as(ROOT), "prospects"), where("coachId", "==", BHAV)))
    )
  );

  await checkLookupBudgetIsEnforced();

  await env.cleanup();
  console.log(
    failures === 0
      ? `\nAll ${passes} rules checks passed.\n`
      : `\n${failures} rules check(s) FAILED.\n`
  );
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
