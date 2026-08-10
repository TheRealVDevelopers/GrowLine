"use client";

import { useState } from "react";
import CaptureFields, { emptyCapture, type CaptureValues } from "@/components/CaptureFields";
import { DISCLAIMER } from "@/lib/report-copy";

export default function SelfCaptureForm({
  code,
  coachName,
}: {
  code: string;
  coachName: string;
}) {
  const [values, setValues] = useState<CaptureValues>(emptyCapture);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const canSubmit = values.name.trim().length >= 2 && values.phone.length === 10;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/public/capture/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name.trim(),
          phone: values.phone,
          age: values.age === "" ? null : Number(values.age),
          gender: values.gender === "" ? null : values.gender,
          heightCm: values.heightCm === "" ? null : Number(values.heightCm),
          weightKg: values.weightKg === "" ? null : Number(values.weightKg),
        }),
      });
      if (res.ok) {
        setDone(true);
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not send. Please try again.");
    } catch {
      setError("No connection. Please check your network and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-elevated px-6 py-12 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gem-green text-2xl text-text">
          ✓
        </span>
        <h2 className="text-xl font-semibold">Thank you!</h2>
        <p className="text-text-dim">
          {coachName.split(" ")[0]} has your details and will message you on WhatsApp
          shortly.
        </p>
        <p className="mt-2 text-sm text-text-dim">{DISCLAIMER}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <CaptureFields values={values} onChange={setValues} selfMode />

      {error && (
        <p className="rounded-xl bg-elevated px-4 py-3 text-sm text-heat">{error}</p>
      )}

      <button
        type="submit"
        disabled={!canSubmit || busy}
        className="h-14 rounded-xl bg-gold text-lg font-semibold text-on-gold disabled:opacity-40"
      >
        {busy ? "Sending…" : "Get my report"}
      </button>
      {/* Says "your coach and their team", not "only {coach}": the Section 5.4
          sharing toggle can make details visible to the coach's upline, and a
          promise of exclusivity here would be a misrepresentation. */}
      <p className="text-center text-sm text-text-dim">
        Your details go to {coachName} and their coaching team, to send you this
        snapshot and follow up. {DISCLAIMER}
      </p>
    </form>
  );
}
