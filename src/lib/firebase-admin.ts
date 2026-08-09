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

export const usingEmulators = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

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
  // FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST. Passing a fake service
  // account here would mask a missing one in production.
  if (usingEmulators) return initializeApp({ projectId: projectId() });

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT is not set, and no emulator host is configured. " +
        "Refusing to start: without one of the two, every query fails at request " +
        "time instead of here."
    );
  }
  return initializeApp({ credential: cert(JSON.parse(raw)), projectId: projectId() });
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
