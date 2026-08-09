"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";

/**
 * Browser-side Firebase. Auth only.
 *
 * Firestore is deliberately NOT exported here. Every read and write still goes
 * through API routes and server components using the Admin SDK (DECISIONS.md D1,
 * D38), and `firestore.rules` denies all client access until v2.1b. Importing the
 * client Firestore SDK here would be the first step toward quietly bypassing that.
 *
 * Phone auth is the one thing that MUST happen in the browser: Firebase issues the
 * SMS and solves the reCAPTCHA client-side, then hands back an ID token that the
 * server verifies.
 */

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let cachedAuth: Auth | null = null;

export function firebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(config);
}

export function firebaseAuth(): Auth {
  if (cachedAuth) return cachedAuth;
  const auth = getAuth(firebaseApp());

  // Against the emulator there is no real SMS and no reCAPTCHA. Test numbers
  // configured in the Auth emulator return a fixed code, which is what makes the
  // login flow runnable in CI without a phone.
  const emulator = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;
  if (emulator) {
    connectAuthEmulator(auth, `http://${emulator}`, { disableWarnings: true });
  }

  // The SMS arrives on the coach's phone; the UI should speak their language
  // where Firebase has it. Falls back to the device locale.
  auth.useDeviceLanguage();
  cachedAuth = auth;
  return auth;
}

export const usingAuthEmulator = Boolean(
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST
);
