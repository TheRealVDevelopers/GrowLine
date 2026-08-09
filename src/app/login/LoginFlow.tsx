"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProfileForm from "@/components/ProfileForm";

type Step = "phone" | "otp" | "profile";

const inputCls =
  "h-14 w-full rounded-xl border border-navy/20 bg-white px-4 outline-none focus:border-gold focus:ring-2 focus:ring-gold/30";

export default function LoginFlow() {
  const router = useRouter();
  const refCode = useSearchParams().get("ref")?.toUpperCase() ?? "";

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [signupToken, setSignupToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const requestOtp = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      setDevCode(data.devCode ?? null);
      setCode("");
      setStep("otp");
    } catch {
      setError("No connection. Check your network and try again.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (otp: string) => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code: otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      if (data.isNewUser) {
        setSignupToken(data.signupToken);
        setStep("profile");
      } else {
        router.replace("/");
        router.refresh();
      }
    } catch {
      setError("No connection. Check your network and try again.");
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
        Grow<span className="text-gold">line</span>
      </h1>
      <p className="mt-2 text-navy/60">Your team, your day, your growth — one app.</p>

      {refCode && step !== "profile" && (
        <p className="mt-4 self-start rounded-full bg-gold-100 px-4 py-2 text-sm font-medium text-gold-600">
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
              <p className="rounded-xl bg-error-100 px-4 py-3 text-sm text-error">{error}</p>
            )}
            <button
              type="submit"
              disabled={busy || phone.length !== 10}
              className="h-14 rounded-xl bg-gold text-lg font-semibold text-navy disabled:opacity-40"
            >
              {busy ? "Sending…" : "Get OTP"}
            </button>
            <p className="text-center text-sm text-navy/50">
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
            {devCode && (
              <p className="rounded-xl border border-gold bg-gold-100 px-4 py-3 text-sm">
                Dev mode — your code is <b className="tracking-widest">{devCode}</b>
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
              <p className="rounded-xl bg-error-100 px-4 py-3 text-sm text-error">{error}</p>
            )}
            {busy && <p className="text-center text-sm text-navy/50">Checking…</p>}
            <div className="flex justify-between text-sm font-medium text-gold-600">
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
            <ProfileForm mode="signup" signupToken={signupToken} initialReferral={refCode} />
          </div>
        )}
      </div>
    </main>
  );
}
