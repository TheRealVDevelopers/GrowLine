"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The monthly target ring (v2 §4, dopamine map #2).
 *
 * ## Why the REMAINING arc is the lit one
 *
 * v2 §4 is explicit: "The ring deliberately shows the REMAINING arc." Incomplete
 * progress is what creates the tension that drives completion — the Zeigarnik
 * effect. A ring showing what you have already done is a receipt; a ring showing
 * what is left is a prompt. Do not "fix" this to fill clockwise.
 *
 * ## What it must never say
 *
 * Points only. No ₹, no conversion, no projection, no "at this rate you would…".
 * RULES L4 and D30 — a target is a count and nothing else, and this is the most
 * tempting screen in the app to break that on.
 */

const SIZE = 200;
const STROKE = 14;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

/** Crossings worth celebrating, per v2 §4. */
const MILESTONES = [25, 50, 75, 100];

export default function TargetRing({
  progress,
  target,
  previousPercent,
}: {
  progress: number;
  target: number;
  /** Last percentage the coach saw, so a celebration fires on the crossing only. */
  previousPercent?: number;
}) {
  const pct = target > 0 ? Math.round((progress / target) * 100) : 0;
  const clamped = Math.min(100, Math.max(0, pct));
  const remaining = Math.max(0, target - progress);

  const [shown, setShown] = useState(0);
  const [celebrating, setCelebrating] = useState(false);
  const dismissed = useRef(false);

  // Count up on load — the number is the emotional content (v1 §9).
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(clamped);
      return;
    }
    let frame = 0;
    const steps = 24;
    const id = setInterval(() => {
      frame += 1;
      setShown(Math.round((clamped * frame) / steps));
      if (frame >= steps) clearInterval(id);
    }, 1000 / 60);
    return () => clearInterval(id);
  }, [clamped]);

  // Fire only when a milestone is newly crossed, never on every render.
  useEffect(() => {
    if (previousPercent === undefined) return;
    const crossed = MILESTONES.some((m) => previousPercent < m && pct >= m);
    if (!crossed) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    setCelebrating(true);
    // Under 1.5s and skippable by tap (G5). Never blocks input.
    const id = setTimeout(() => setCelebrating(false), 1400);
    return () => clearTimeout(id);
  }, [pct, previousPercent]);

  const dashRemaining = (CIRCUMFERENCE * (100 - clamped)) / 100;

  return (
    <div
      className="relative mx-auto w-fit"
      onClick={() => {
        // Skippable: one tap ends the celebration (G5).
        if (celebrating && !dismissed.current) {
          dismissed.current = true;
          setCelebrating(false);
        }
      }}
      data-testid="target-ring"
      data-percent={pct}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
        {/* The done part recedes into the surface — it is not the story. */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="var(--hairline)"
          strokeWidth={STROKE}
        />
        {/* The REMAINING arc, in gold. Starts at 12 o'clock. */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="var(--gold)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${dashRemaining} ${CIRCUMFERENCE}`}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          className={celebrating ? "glow-gold" : undefined}
          style={{ transition: "stroke-dasharray 240ms ease-out" }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="numeral text-5xl text-text">{shown}%</span>
        <span className="mt-1 text-sm text-text-dim">
          {clamped >= 100
            ? "Target reached"
            : `${remaining.toLocaleString("en-IN")} points to go`}
        </span>
      </div>

      {celebrating && (
        <p
          role="status"
          className="animate-rise absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold gem"
        >
          {/* Effort, never earnings (RULES L4). */}
          {pct >= 100 ? "Target reached. Your line can see this." : `Past ${
            MILESTONES.filter((m) => pct >= m).slice(-1)[0]
          }%`}
        </p>
      )}
    </div>
  );
}
