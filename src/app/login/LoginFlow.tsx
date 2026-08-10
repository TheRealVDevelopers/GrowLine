"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from "firebase/auth";
import ProfileForm from "@/components/ProfileForm";
import { firebaseAuth, usingAuthEmulator } from "@/lib/firebase";

type Step = "phone" | "otp" | "profile";

const inputCls =
  "h-14 w-full rounded-xl border border-hairline bg-elevated px-4 outline-none focus:border-gold focus:ring-2 focus:ring-gold/30";

export default function LoginFlow() {
  const router = useRouter();
  const refCode = useSearchParams().get("ref")?.toUpperCase() ?? "";

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [idToken, setIdToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Firebase holds the SMS session between "send code" and "check code".
  const confirmation = useRef<ConfirmationResult | null>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null);

  /**
   * Invisible reCAPTCHA, created once and reused. Firebase requires a verifier
   * for web phone auth — there is no way to opt out — but "invisible" means the
   * coach sees nothing unless Google decides the request looks automated.
   * The emulator needs no verifier at all.
   */
  const getVerifier = () => {
    if (!verifier.current) {
      verifier.current = new RecaptchaVerifier(firebaseAuth(), "recaptcha-container", {
        size: "invisible",
      });
    }
    return verifier.current;
  };

  const requestOtp = async () => {
    setError("");
    setBusy(true);
    try {
      confirmation.current = await signInWithPhoneNumber(
        firebaseAuth(),
        `+91${phone}`,
        getVerifier()
      );
      setCode("");
      setStep("otp");
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "";
      setError(
        code === "auth/too-many-requests"
          ? "Too many attempts from this number. Try again in a little while."
          : code === "auth/invalid-phone-number"
            ? "That number doesn't look right. Check and try again."
            : "Could not send the code. Check your network and try again."
      );
      // A used verifier cannot be reused after a failure.
      verifier.current?.clear();
      verifier.current = null;
    } finally {
      setBusy(false);
    }
  };

  const verify = async (otp: string) => {
    setError("");
    setBusy(true);
    try {
      if (!confirmation.current) {
        setError("That code expired. Please request a new one.");
        setStep("phone");
        return;
      }
      const cred = await confirmation.current.confirm(otp);
      const token = await cred.user.getIdToken();

      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      if (data.isNewUser) {
        // No session cookie yet — the token carries the verified number through
        // profile setup, and the cookie is issued once the user document exists.
        setIdToken(token);
        setStep("profile");
      } else {
        router.replace("/");
        router.refresh();
      }
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "";
      setError(
        code === "auth/invalid-verification-code"
          ? "That code isn't right. Check and try again."
          : code === "auth/code-expired"
            ? "That code expired. Please request a new one."
            : "Something went wrong. Try again."
      );
    } finally {
      setBusy(false);
    }
  };

  // 30-second rule: submit the moment the 6th digit lands, no button press.
  const onCodeChange = (raw: string) => {
    const next = raw.replace(/\D/g, "").slice(0, 6);
    setCode(next);
    if (next.length === 6 && !busy) void verify(next);
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <h1 className="text-4xl font-bold tracking-tight">
        Grow<span className="text-gold-ink">line</span>
      </h1>
      <p className="mt-2 text-text-dim">Your team, your day, your growth — one app.</p>

      {refCode && step !== "profile" && (
        <p className="mt-4 self-start rounded-full bg-elevated px-4 py-2 text-sm font-medium text-gold-ink">
          Joining with code {refCode}
        </p>
      )}

      <div className="mt-8">
        {step === "phone" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void requestOtp();
            }}
            className="flex flex-col gap-4"
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Your mobile number</span>
              <div className="flex items-center gap-2">
                <span className="flex h-14 items-center rounded-xl bg-surface px-4 text-lg font-semibold">
                  +91
                </span>
                <input
                  className={`${inputCls} text-xl tracking-wider`}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="98765 43210"
                  autoFocus
                />
              </div>
            </label>
            {error && (
              <p className="rounded-xl bg-elevated px-4 py-3 text-sm text-heat">{error}</p>
            )}
            <button
              type="submit"
              disabled={busy || phone.length !== 10}
              className="h-14 rounded-xl bg-gold text-lg font-semibold text-on-gold disabled:opacity-40"
            >
              {busy ? "Sending…" : "Get OTP"}
            </button>
            <p className="text-center text-sm text-text-dim">
              New here? Enter your number — we&apos;ll set you up in a minute.
            </p>
          </form>
        )}

        {step === "otp" && (
          <div className="flex flex-col gap-4">
            <p>
              Enter the 6-digit code sent to{" "}
              <span className="font-semibold">+91 {phone.slice(0, 5)} {phone.slice(5)}</span>
            </p>
            {usingAuthEmulator && (
              <p className="rounded-xl border border-gold bg-elevated px-4 py-3 text-sm">
                Emulator — use the code configured for this test number.
              </p>
            )}
            <input
              className={`${inputCls} text-center text-3xl font-bold tracking-[0.4em]`}
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="••••••"
              autoFocus
            />
            {error && (
              <p className="rounded-xl bg-elevated px-4 py-3 text-sm text-heat">{error}</p>
            )}
            {busy && <p className="text-center text-sm text-text-dim">Checking…</p>}
            <div className="flex justify-between text-sm font-medium text-gold-ink">
              <button className="h-12 px-2" onClick={() => { setStep("phone"); setError(""); }}>
                Change number
              </button>
              <button className="h-12 px-2" onClick={() => void requestOtp()} disabled={busy}>
                Resend code
              </button>
            </div>
          </div>
        )}

        {step === "profile" && (
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold">Welcome! Tell us about you</h2>
            <ProfileForm mode="signup" idToken={idToken} initialReferral={refCode} />
          </div>
        )}
      </div>

      {/* Firebase mounts the invisible reCAPTCHA here. Must exist before
          signInWithPhoneNumber runs, and must not be conditionally rendered. */}
      <div id="recaptcha-container" />
    </main>
  );
}
