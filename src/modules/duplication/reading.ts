import type { LevelResult, ScoreResult } from "./score";
import { MIN_TENURE_DAYS, WINDOW_DAYS } from "./score";

/**
 * Turning the number into words. PURE — the score's maths lives in `score.ts` and
 * every sentence a coach reads lives here, so the two can be changed independently
 * and the wording can be reviewed as wording.
 *
 * ## Three rules this file exists to hold
 *
 * **L4 — no money, no projection.** Not one sentence below multiplies anything by a
 * rupee figure or says what a number would become. "At this rate" is banned outright:
 * a duplication score with a trajectory attached is an income promise that leaves the
 * arithmetic to the reader.
 *
 * **S6 — simple words.** "Level 2", "your direct line", "logged". Never "engagement",
 * never "penetration", never "activity index".
 *
 * **Nothing here shames anybody.** A low score is a fact about a line, stated
 * plainly, followed by the level to look at. The failure mode this feature has to
 * avoid is a coach opening it, reading a verdict, and closing the app — so every
 * band names something to do, and the two "there is no score" cases say what will
 * make one appear rather than reporting a zero.
 */

/**
 * The definition, in one sentence, rendered on the card.
 *
 * A single word — "duplication" — cannot be relied on to mean the same thing to
 * every coach, so the screen never depends on knowing it.
 */
export const WHAT_IT_MEANS =
  `Out of everybody in your line, how many are logging their work — counted level ` +
  `by level, over the last ${WINDOW_DAYS} days. Levels further down count for more, ` +
  `because work happening three levels away is work you are not doing yourself.`;

export const WHAT_IT_IS_NOT =
  "It counts people, not points. Nothing here is about money.";

export type Band = "none" | "topHeavy" | "spreading" | "through";

export type Reading = {
  band: Band;
  /** One line, stated as a fact about the line. */
  headline: string;
};

/**
 * Four bands.
 *
 * Zero gets its own band because it is a genuinely different statement: not "the
 * work is thin down there" but "nobody below you logged at all", which is the exact
 * condition this feature is named after and the only one where the top is provably
 * carrying everything.
 */
export function readingOf(score: number): Reading {
  if (score <= 0) {
    return {
      band: "none",
      headline: "Nobody in your line logged their work in this window.",
    };
  }
  if (score <= 33) {
    return {
      band: "topHeavy",
      headline: "A few people in your line are working. Most are not.",
    };
  }
  if (score <= 66) {
    return {
      band: "spreading",
      headline: "The work is starting to spread down your line.",
    };
  }
  return {
    band: "through",
    headline: "The work is happening right through your line.",
  };
}

/** "your direct line" is what a coach calls level 1; deeper levels have no nickname. */
export function levelLabel(depth: number): string {
  return depth === 1 ? "Level 1 — your direct line" : `Level ${depth}`;
}

export function peopleWord(n: number): string {
  return n === 1 ? "person" : "people";
}

/** "3 of 8 logged" — the only form the breakdown ever states a level in. */
export function levelSentence(level: LevelResult): string {
  if (level.people === 0) {
    return `${level.pending} ${peopleWord(level.pending)} here, all joined in the last week.`;
  }
  return `${level.active} of ${level.people} ${peopleWord(level.people)} logged.`;
}

export type Stop = {
  depth: number;
  /** What to do about it, in one line. Never a scolding. */
  sentence: string;
};

/**
 * The level worth looking at — the actionable half of this feature.
 *
 * A hard stop first: the shallowest level where NOBODY logged is where duplication
 * has stopped, and it is the level to ring tonight. Failing that, the thinnest level
 * that is not already complete. If every level is fully active there is nothing to
 * fix and this returns null, and the card says so rather than manufacturing a
 * concern to fill the space.
 */
export function whereItStops(levels: LevelResult[]): Stop | null {
  const counted = levels.filter((l) => l.people > 0);
  if (counted.length === 0) return null;

  const dead = counted.find((l) => l.active === 0);
  if (dead) {
    return {
      depth: dead.depth,
      sentence:
        dead.depth === 1
          ? `Nobody in your direct line logged. That is the first conversation to have.`
          : `Level ${dead.depth} is where it stops — nobody there logged. The people at ` +
            `level ${dead.depth - 1} are the ones who can reach them.`,
    };
  }

  const thinnest = [...counted]
    .filter((l) => l.rate < 1)
    // Thinnest first; deeper wins a tie, because that is the harder one to reach.
    .sort((a, b) => a.rate - b.rate || b.depth - a.depth)[0];
  if (!thinnest) return null;

  const missing = thinnest.people - thinnest.active;
  return {
    depth: thinnest.depth,
    sentence:
      `Level ${thinnest.depth} is the thinnest — ${missing} ${peopleWord(missing)} ` +
      `there have not logged.`,
  };
}

/**
 * What to say when there is no score. Both cases are about something not having
 * started, and neither is a zero.
 */
export function noScoreCopy(reason: ScoreResult["reason"]): {
  headline: string;
  body: string;
} {
  if (reason === "allTooNew") {
    return {
      headline: "Everybody in your line is brand new.",
      body:
        `Nobody is counted until they have been in your line for ${MIN_TENURE_DAYS} ` +
        `days — judging somebody in their first week says more about their week than ` +
        `about your line. This starts filling in on its own.`,
    };
  }
  return {
    headline: "Your line has not started yet.",
    body:
      "This measures the people below you, so it needs somebody there first. " +
      "Share your invite link, and when your first person joins and logs their work, " +
      "the first level appears here.",
  };
}

/**
 * The growth line under the breakdown, when a line is shallower than three levels.
 *
 * Framed as what happens next, never as a level the coach is missing. A one-level
 * line scoring 100 is a real 100 — see score.ts — and this sentence has to agree
 * with that rather than quietly take it back.
 */
export function nextLevelCopy(deepestLevel: number | null): string | null {
  if (deepestLevel === null || deepestLevel >= 3) return null;
  return (
    `Your line reaches ${deepestLevel} level${deepestLevel === 1 ? "" : "s"} today. ` +
    `Level ${deepestLevel + 1} appears when somebody at level ${deepestLevel} brings ` +
    `in their own first person.`
  );
}
