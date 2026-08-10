"use client";

import { useEffect, useState } from "react";
import { THEME_KEY } from "./ThemeScript";

type Theme = "dark" | "light";

/**
 * The Settings switch (v2 §4: "switchable in Settings").
 *
 * Reads the attribute ThemeScript already set rather than re-deriving it, so the
 * control can never disagree with what is on screen.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  const choose = (next: Theme) => {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage unavailable — the theme still applies for this session.
    }
    setTheme(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Appearance</span>
      <div
        role="radiogroup"
        aria-label="Appearance"
        className="flex gap-2 rounded-xl border border-hairline bg-surface p-1"
      >
        {(["dark", "light"] as const).map((option) => (
          <button
            key={option}
            role="radio"
            aria-checked={theme === option}
            onClick={() => choose(option)}
            data-testid={`theme-${option}`}
            className={
              theme === option
                ? "metal-gold h-11 flex-1 rounded-lg text-sm font-semibold capitalize"
                : "h-11 flex-1 rounded-lg text-sm font-medium capitalize text-text-dim"
            }
          >
            {option}
          </button>
        ))}
      </div>
      <p className="text-sm text-text-dim">
        Dark is the default. Your choice is remembered on this device.
      </p>
    </div>
  );
}
