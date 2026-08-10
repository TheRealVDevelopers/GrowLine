import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Server-side Firebase. This is the only place credentials are read.
 *
 * All data access stays server-side — API routes and server components — exactly
 * as it did under Prisma (DECISIONS.md D1: "no client-side DB calls, so the swap
 * is contained to the server layer"). The Admin SDK bypasses Security Rules, which
 * is why `firestore.rules` denies everything until v2.1b gives the browser a
 * reason to read directly.
 */

/**
 * Which project this process talks to — decided once, at import, and allowed to be
 * only one of two things.
 *
 * The Admin SDK resolves emulator routing per product, from two independent
 * variables: Firestore reads FIRESTORE_EMULATOR_HOST, Auth reads
 * FIREBASE_AUTH_EMULATOR_HOST. Set one without the other and half of this app talks
 * to a real project. The auth-only half is the dangerous half: with
 * FIREBASE_AUTH_EMULATOR_HOST set, `verifyIdToken` and `verifySessionCookie` stop
 * checking the signature and merely decode — `token-verifier.js` swaps in the
 * emulator verifier, which is `verifyJwtSignature(token, undefined, { algorithms:
 * ['none'] })`, and stops requiring `kid` and RS256 at the same time. So a cookie
 * signed with nothing, naming any uid, is accepted against real data, and nothing in
 * the logs says so.
 *
 * `usingEmulators` used to read FIRESTORE_EMULATOR_HOST alone, which made exactly
 * that state invisible: it stayed false, so the missing-credential check below was
 * satisfied by a real service account while every token went unverified. One
 * variable in a deploy config, and everything looked correct. Hence a guard rather
 * than a paragraph in .env.example.
 *
 * Two configurations boot, and no others:
 *   - both emulator hosts set, FIREBASE_SERVICE_ACCOUNT unset — dev, e2e, CI
 *   - both emulator hosts unset, FIREBASE_SERVICE_ACCOUNT set — a real project
 *
 * NODE_ENV takes no part, deliberately. `next build` then `next start` against the
 * emulators is how the production bundle gets checked before it ships, so
 * NODE_ENV=production is not evidence of a real deployment, and gating on it would
 * break that check. A service account is the honest signal of intent — it exists
 * only to reach a real project — which is why one alongside an emulator host is an
 * error rather than a precedence rule to pick.
 *
 * Presence is plain truthiness because that is the test the SDK itself applies:
 * `useEmulator()` in `auth-api-request.js` is `!!process.env.FIREBASE_AUTH_EMULATOR_HOST`,
 * so `FOO=""` is unset to both — which is why .env.example's empty credential line is
 * fine. Anything stricter here — trimming, a host-shape check — could call a value
 * unset that the SDK still routes on, and a guard that disagrees with the thing it
 * guards is worse than no guard.
 *
 * When Storage is switched on (storage.rules is deny-all until then, and says why),
 * FIREBASE_STORAGE_EMULATOR_HOST has to join this pair in the same change. A third
 * product with its own variable is the same skew waiting to happen.
 */
type FirebaseTarget =
  | { usingEmulators: true }
  | { usingEmulators: false; serviceAccount: string };

function resolveTarget(): FirebaseTarget {
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (authHost && !firestoreHost) {
    throw new Error(
      "FIREBASE_AUTH_EMULATOR_HOST is set but FIRESTORE_EMULATOR_HOST is not. " +
        "Emulator routing is per product, so this reads and writes a REAL project " +
        "while the Admin SDK stops verifying ID-token and session-cookie signatures — " +
        "an unsigned cookie naming any user would be accepted. Set " +
        "FIRESTORE_EMULATOR_HOST as well to use the emulators, or unset " +
        "FIREBASE_AUTH_EMULATOR_HOST."
    );
  }

  if (firestoreHost && !authHost) {
    throw new Error(
      "FIRESTORE_EMULATOR_HOST is set but FIREBASE_AUTH_EMULATOR_HOST is not. Auth " +
        "would stay on the live project with no credential while all data went to the " +
        "emulator, so sign-in fails at request time with a credentials error that " +
        "points nowhere near the cause. Set FIREBASE_AUTH_EMULATOR_HOST as well, or " +
        "unset FIRESTORE_EMULATOR_HOST."
    );
  }

  if (firestoreHost && serviceAccount) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT is set alongside FIRESTORE_EMULATOR_HOST and " +
        "FIREBASE_AUTH_EMULATOR_HOST. The emulator hosts win, so the credential is " +
        "decoration: every read and write would go to a local emulator and every token " +
        "would go unverified, in a process configured to look like production. Unset " +
        "both emulator hosts to use the credential, or unset FIREBASE_SERVICE_ACCOUNT " +
        "to use the emulators."
    );
  }

  if (firestoreHost) return { usingEmulators: true };

  if (!serviceAccount) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT is not set, and no emulator host is configured. " +
        "Refusing to start: without one of the two, every query fails at request " +
        "time instead of here."
    );
  }

  return { usingEmulators: false, serviceAccount };
}

// Module scope on purpose. `createApp()` below runs only when no app exists yet, so
// a guard living inside it could be skipped by initialization order; this one runs
// for anyone who imports `db` or `auth`, which is every server path.
const target = resolveTarget();

export const usingEmulators = target.usingEmulators;

function projectId(): string {
  const id =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT;
  if (!id) throw new Error("NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set");
  return id;
}

function createApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  // Against the emulators the SDK needs no credentials at all — it routes to
  // FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST, and `resolveTarget` has
  // established that BOTH are set. Passing a fake service account here would mask a
  // missing one in production.
  if (target.usingEmulators) return initializeApp({ projectId: projectId() });

  // No credential check here any more: the union `resolveTarget` returns carries the
  // service account only on this branch, so "real project, no credential" is not a
  // state this function can be reached in.
  return initializeApp({
    credential: cert(JSON.parse(target.serviceAccount)),
    projectId: projectId(),
  });
}

const globalForFirebase = globalThis as unknown as {
  firebaseApp?: App;
  firestore?: Firestore;
};

export const app = globalForFirebase.firebaseApp ?? createApp();
globalForFirebase.firebaseApp = app;

function createFirestore(): Firestore {
  const store = getFirestore(app);
  // `settings()` may be called ONCE per Firestore instance, ever — a second call
  // throws "Firestore has already been initialized".
  //
  // Next evaluates this module more than once while collecting page data, and
  // both the firebase-admin app and its Firestore are process-wide singletons, so
  // the second evaluation gets the same object back. Hence the cache is
  // unconditional: gating it on NODE_ENV !== "production" (the shape D1 used for
  // Prisma, where the concern was HMR duplicating clients) breaks `next build`.
  if (!globalForFirebase.firestore) {
    // `undefined` is how an optional column arrives from a form. Without this the
    // SDK throws on every optional prospect field (age, gender, height, weight)
    // rather than simply omitting them.
    store.settings({ ignoreUndefinedProperties: true });
    globalForFirebase.firestore = store;
  }
  return store;
}

export const db = globalForFirebase.firestore ?? createFirestore();
export const auth = getAuth(app);
