import { APP_TIMEZONE } from "./day";

/**
 * Threads — one-way broadcasts down a line (F8, v2 §6).
 *
 * ## What this feature is, and what it deliberately is not
 *
 * An upline writes one message and their line receives it. A downline can tap
 * acknowledge, and the sender watches that count rise. Any coach can re-broadcast
 * something they received to THEIR own line, which is how one message cascades
 * through thousands of people while every sender only ever writes to their own.
 *
 * It is NOT a chat. v1 §5.5 and RULES S3 forbid group chat outright, and the reason
 * is not squeamishness: two-way team chatter needs moderation, creates noise nobody
 * can catch up on, and WhatsApp already exists for it. So there is no reply, no
 * reaction, no mention, and no field on the document that could grow into one. The
 * only response a downline can make is "I saw this", and it is a number.
 *
 * PURE ONLY — no database import. `ThreadComposer` and `ThreadFeed` are client
 * components, and E2 exists because importing a queries module into a client file
 * pulls a server driver into the browser bundle.
 */

export const THREAD_SCOPES = ["direct", "all"] as const;
export type ThreadScope = (typeof THREAD_SCOPES)[number];

/**
 * Long enough for a real announcement, short enough to read standing up. The daily
 * log's note is 140 because it is a scribble; a broadcast is the one place a coach
 * writes something considered, so it gets more room than that and far less than an
 * essay nobody on a ₹10K phone will scroll.
 */
export const MAX_BODY = 1000;
export const MAX_LINK_URL = 500;

export function isThreadScope(value: unknown): value is ThreadScope {
  return typeof value === "string" && (THREAD_SCOPES as readonly string[]).includes(value);
}

export const SCOPE_LABELS: Record<ThreadScope, string> = {
  direct: "My direct line only",
  all: "My whole line",
};

/** What the sender is told the choice means, in the words this audience uses. */
export const SCOPE_HELP: Record<ThreadScope, string> = {
  direct: "Only the coaches you brought in yourself.",
  all: "Everyone in your line, however deep it goes.",
};

export type BodyCheck = { ok: true; body: string } | { ok: false; error: string };

/**
 * Trims, then rejects empty and over-long. The trim matters: a body of only spaces
 * would otherwise send a blank card to a whole line, with a push notification.
 */
export function checkBody(raw: unknown): BodyCheck {
  if (typeof raw !== "string") return { ok: false, error: "Write a message first." };
  const body = raw.trim();
  if (body.length === 0) return { ok: false, error: "Write a message first." };
  if (body.length > MAX_BODY) {
    return { ok: false, error: `Keep it under ${MAX_BODY} characters.` };
  }
  return { ok: true, body };
}

export type LinkCheck = { ok: true; linkUrl: string | null } | { ok: false; error: string };

/**
 * An optional link, and the validation is a security control rather than politeness.
 *
 * This URL is rendered as an anchor on every recipient's screen, so the scheme is an
 * allow-list of exactly `http` and `https`. `javascript:` is the obvious one to keep
 * out, but `data:` matters just as much — a `data:text/html` link opens attacker-authored
 * markup on our own origin's tab, and this is the one field in the app whose contents
 * are authored by one user and displayed to thousands of others.
 *
 * Parsing with `new URL` rather than a regex is deliberate: a regex on URLs is how
 * `https:/\/evil.com` gets through.
 */
export function checkLinkUrl(raw: unknown): LinkCheck {
  if (raw === undefined || raw === null || raw === "") return { ok: true, linkUrl: null };
  if (typeof raw !== "string") return { ok: false, error: "That link does not look right." };
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, linkUrl: null };
  if (trimmed.length > MAX_LINK_URL) return { ok: false, error: "That link is too long." };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "Add a full link, starting with https://" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only https:// links can be shared." };
  }
  return { ok: true, linkUrl: parsed.toString() };
}

/**
 * The attribution line on a re-broadcast.
 *
 * Always the ORIGINAL author, never the hop it arrived through. If Asha writes
 * something, Bhavana forwards it and Chetan forwards that, Chetan's line should read
 * "via Asha" — the person being trusted is whoever wrote it, and a chain of "via
 * Bhavana, via Asha" is both noise and a small map of somebody's team structure.
 */
export function attribution(originalSenderName: string | null): string | null {
  return originalSenderName ? `via ${originalSenderName}` : null;
}

/**
 * Whether a reader is in scope for a thread, given who sent it and where the reader
 * sits. The single place this rule is expressed for the app; `firestore.rules` states
 * the same thing independently, because a client must not be able to read what this
 * would have hidden.
 *
 * `uplinePath[0]` is the direct upline (D36), so "direct" is an equality check
 * against the nearest ancestor and "all" is membership anywhere in the chain.
 */
export function canRead(
  thread: { senderId: string; scope: string },
  reader: { id: string; uplineId: string | null; uplinePath: string[] }
): boolean {
  if (thread.senderId === reader.id) return true;
  if (thread.scope === "direct") return thread.senderId === reader.uplineId;
  return reader.uplinePath.includes(thread.senderId);
}

/**
 * "2 min ago" / "3 h ago" / "12 Aug". Threads are read newest-first and a coach cares
 * about "is this today", not the minute — so recent gets relative and older gets a
 * date, which is shorter to scan than a timestamp nobody reads.
 */
export function relativeTime(when: Date, now = new Date()): string {
  const seconds = Math.round((now.getTime() - when.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return when.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: APP_TIMEZONE,
  });
}

/**
 * How many people a sender is writing to, phrased so nobody has to parse a number
 * against a label. Zero is its own case: a coach with no line who taps send would
 * otherwise get a confident "Sent to 0 people".
 */
export function audienceLabel(count: number, scope: ThreadScope): string {
  if (count === 0) {
    return scope === "direct"
      ? "You have no direct line yet"
      : "You have nobody in your line yet";
  }
  const who = count === 1 ? "1 coach" : `${count} coaches`;
  return scope === "direct" ? `${who} in your direct line` : `${who} in your line`;
}
