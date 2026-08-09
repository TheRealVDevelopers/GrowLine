"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  isQueueSupported,
  listQueued,
  listQueuedLogs,
  syncQueue,
} from "@/lib/offline-queue";

/** Fired after the queue changes so any mounted list can re-read it. */
export const QUEUE_CHANGED = "growline:queue-changed";

/**
 * Drains the offline capture queue from anywhere in the app. Mounted in the
 * authenticated layout on purpose: a coach who captures ten people on a walk may
 * never open the Prospects list, and their work still has to reach the server.
 */
export default function OfflineSync() {
  const router = useRouter();

  useEffect(() => {
    if (!isQueueSupported()) return;
    let cancelled = false;
    let running = false;

    const drain = async () => {
      if (running || cancelled) return;
      if (!navigator.onLine) return;
      // Both queues, not just prospects: checking only one meant a queued evening
      // log would sit on the phone forever whenever nothing else was pending.
      const [prospects, logs] = await Promise.all([listQueued(), listQueuedLogs()]);
      if (prospects.length + logs.length === 0 || cancelled) return;
      running = true;
      const result = await syncQueue();
      running = false;
      if (cancelled) return;
      if (result.synced > 0) {
        window.dispatchEvent(new Event(QUEUE_CHANGED));
        router.refresh();
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void drain();
    };

    void drain();
    window.addEventListener("online", drain);
    window.addEventListener(QUEUE_CHANGED, drain);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("online", drain);
      window.removeEventListener(QUEUE_CHANGED, drain);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
