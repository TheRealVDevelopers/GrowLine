"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CaptureFields, { emptyCapture, type CaptureValues } from "@/components/CaptureFields";
import { newClientId, queueProspect, isQueueSupported } from "@/lib/offline-queue";
import { QUEUE_CHANGED } from "@/components/OfflineSync";

function toPayload(v: CaptureValues) {
  return {
    name: v.name.trim(),
    phone: v.phone,
    age: v.age === "" ? null : Number(v.age),
    gender: v.gender === "" ? null : v.gender,
    heightCm: v.heightCm === "" ? null : Number(v.heightCm),
    weightKg: v.weightKg === "" ? null : Number(v.weightKg),
  };
}

export default function NewProspectForm() {
  const router = useRouter();
  const [values, setValues] = useState<CaptureValues>(emptyCapture);
  const [error, setError] = useState("");
  const [queuedCount, setQueuedCount] = useState(0);
  const [busy, setBusy] = useState(false);

  const canSave = values.name.trim().length >= 2 && values.phone.length === 10;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || busy) return;
    setError("");
    setBusy(true);

    const clientId = newClientId();
    const payload = { clientId, ...toPayload(values) };

    // Keep the capture on the phone and sync later. The coach must never lose a
    // person they just met. Confirmation happens in place: navigating away would
    // need an RSC fetch that cannot succeed offline.
    const saveLocally = async () => {
      if (!isQueueSupported()) {
        setError("No connection. Please try again when you have network.");
        return;
      }
      try {
        await queueProspect({ ...payload, savedAt: Date.now() });
        setValues(emptyCapture);
        setQueuedCount((n) => n + 1);
        window.dispatchEvent(new Event(QUEUE_CHANGED));
      } catch {
        setError("Could not save on this phone. Please try again.");
      }
    };

    // Known-offline: don't wait on a request that cannot land.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await saveLocally();
      setBusy(false);
      return;
    }

    try {
      const res = await fetch("/api/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        // A weak signal can leave a request hanging far past the 30-second rule.
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        router.push("/prospects?saved=1");
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not save. Please try again.");
    } catch {
      // Timed out or the network died mid-request.
      await saveLocally();
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {queuedCount > 0 && (
        <p className="rounded-xl bg-elevated px-4 py-3 text-sm text-gold-ink">
          Saved on this phone{queuedCount > 1 ? ` · ${queuedCount} so far` : ""}. It will
          upload by itself when you have network — keep going.
        </p>
      )}

      <CaptureFields values={values} onChange={setValues} />

      {error && (
        <p className="rounded-xl bg-elevated px-4 py-3 text-sm text-heat">{error}</p>
      )}

      <button
        type="submit"
        disabled={!canSave || busy}
        className="h-14 rounded-xl bg-gold text-lg font-semibold text-on-gold disabled:opacity-40"
      >
        {busy ? "Saving…" : "Save person"}
      </button>
      <p className="text-center text-sm text-text-dim">
        Only name and number are needed now — you can add the rest later.
      </p>
    </form>
  );
}
