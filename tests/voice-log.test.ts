import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_PARSE,
  describeHeard,
  normalise,
  parseSpokenLog,
} from "@/modules/voice-log/parse";
import {
  MAX_AUDIO_BYTES,
  MAX_DURATION_MS,
  UNCOUNTED_TTL_DAYS,
  voiceLogDocId,
} from "@/modules/voice-log/model";
import * as copy from "@/modules/voice-log/copy";
import { LOG_FIELDS, MAX_COUNT } from "@/lib/daily-log";

/**
 * Unit tests for the voice-note daily log (session 4, feature 1).
 *
 * ## What these are defending
 *
 * The parser is the only part of this feature that can be wrong quietly. Everything
 * else fails loudly — no microphone shows a screen, a failed upload shows a line — but
 * a parser that invents a number produces a log the coach never said, on their upline's
 * team screen, with nothing anywhere to explain it. So the tests below are weighted
 * heavily toward what it must REFUSE to do, not what it manages to understand.
 *
 * The governing rule, restated as tests: never invent a number. A guess is worse than a
 * blank, because a blank is visible on the confirm screen and a guess is not.
 */

describe("normalise", () => {
  test("collapses the multi-word phrases a recogniser splits", () => {
    // "Follow up" is two words to a recogniser and one idea to a coach. If this did
    // not collapse, every follow-up count in the app would silently never parse.
    assert.equal(normalise("three follow ups"), "three followup");
    assert.equal(normalise("three follow-ups"), "three followup");
    assert.equal(normalise("I followed up with three"), "i followup with three");
    assert.equal(normalise("two new members"), "two member");
    assert.equal(normalise("called back four"), "callback four");
  });

  test("strips punctuation and case without losing digits", () => {
    assert.equal(normalise("5 Shakes, 2 invites!"), "5 shakes 2 invites");
  });

  test("empty in, empty out", () => {
    assert.equal(normalise(""), "");
    assert.equal(normalise("   ,, !! "), "");
  });
});

describe("parseSpokenLog — what it understands", () => {
  test("the sentence the screen tells a coach to say", () => {
    const r = parseSpokenLog("five shakes, two invites, three follow-ups");
    assert.equal(r.values.servings, 5);
    assert.equal(r.values.invites, 2);
    assert.equal(r.values.followupsDone, 3);
    assert.deepEqual(r.heard.sort(), ["followupsDone", "invites", "servings"].sort());
  });

  test("digits and words are equally acceptable", () => {
    // A recogniser renders "five" as a word or a digit depending on the phone and the
    // sentence around it. A parser that only understood one would work on half the
    // devices and nobody would ever work out why.
    assert.equal(parseSpokenLog("5 shakes").values.servings, 5);
    assert.equal(parseSpokenLog("five shakes").values.servings, 5);
  });

  test("the number may follow the keyword", () => {
    assert.equal(parseSpokenLog("shakes five").values.servings, 5);
  });

  test("filler between the number and the word does not break it", () => {
    assert.equal(parseSpokenLog("I did about six shakes today").values.servings, 6);
  });

  test("every field has words a coach actually uses", () => {
    assert.equal(parseSpokenLog("two servings").values.servings, 2);
    assert.equal(parseSpokenLog("one new member").values.memberships, 1);
    assert.equal(parseSpokenLog("three signups").values.memberships, 3);
    assert.equal(parseSpokenLog("two parties").values.sessions, 2);
    assert.equal(parseSpokenLog("four sessions").values.sessions, 4);
    assert.equal(parseSpokenLog("seven invitations").values.invites, 7);
    assert.equal(parseSpokenLog("nine callbacks").values.followupsDone, 9);
  });

  test("zero is a real answer and is heard as one", () => {
    // Distinct from "not mentioned". A coach saying "no members today" has told the
    // app something, and the confirm screen should show it as heard rather than as an
    // assumption the app made for them.
    const r = parseSpokenLog("no members, five shakes");
    assert.equal(r.values.memberships, 0);
    assert.ok(r.heard.includes("memberships"));
  });

  test("a spoken correction replaces rather than sums", () => {
    // Ten seconds of speech: a repeat is a repair, not arithmetic. Summing would turn
    // "five — sorry, six" into eleven, and the coach would have to notice and undo it.
    assert.equal(parseSpokenLog("five shakes no six shakes").values.servings, 6);
  });
});

describe("parseSpokenLog — what it refuses to do", () => {
  test("a keyword with no number counts nothing, and says so", () => {
    const r = parseSpokenLog("I did some shakes today");
    assert.equal(r.values.servings, 0);
    assert.deepEqual(r.heard, []);
    // Reported separately so the screen can name the field it could not pin a number
    // to — "I heard you mention shakes but not a number" beats a silent zero.
    assert.deepEqual(r.mentionedWithoutNumber, ["servings"]);
  });

  test('"a couple" and "a few" are not numbers', () => {
    // They are guesses wearing a number's clothes. Two is a plausible reading of
    // "a couple" and a fabricated entry in someone's business record.
    assert.deepEqual(parseSpokenLog("a couple of shakes").heard, []);
    assert.deepEqual(parseSpokenLog("a few invites").heard, []);
  });

  test("four-digit runs are discarded, not clamped", () => {
    // Recognisers render years and phone numbers as digit runs. Clamping 2026 to 999
    // would be a fabricated number with a straight face; dropping it leaves a blank
    // the coach can see.
    const r = parseSpokenLog("2026 shakes");
    assert.deepEqual(r.heard, []);
    assert.deepEqual(r.mentionedWithoutNumber, ["servings"]);
  });

  test("a number above the log's own ceiling is not accepted", () => {
    assert.equal(MAX_COUNT, 999);
    assert.deepEqual(parseSpokenLog("1500 shakes").heard, []);
  });

  test("one number cannot be spent on two fields", () => {
    // "five shakes invites" must not hand the same five to invites as well. The second
    // keyword finds nothing of its own and goes uncounted, which is the honest answer.
    const r = parseSpokenLog("five shakes invites");
    assert.equal(r.values.servings, 5);
    assert.equal(r.values.invites, 0);
    assert.deepEqual(r.mentionedWithoutNumber, ["invites"]);
  });

  test("a number belonging to another keyword is not stolen backwards", () => {
    const r = parseSpokenLog("two invites shakes");
    assert.equal(r.values.invites, 2);
    assert.equal(r.values.servings, 0);
  });

  test("nothing understood yields a complete set of zeros, not a crash", () => {
    for (const input of ["", "   ", "namaste", "ಶುಭೋದಯ"]) {
      const r = parseSpokenLog(input);
      assert.deepEqual(r.heard, []);
      for (const field of LOG_FIELDS) assert.equal(r.values[field.key], 0);
    }
  });

  test("null and undefined are handled — a recogniser that heard nothing returns nothing", () => {
    assert.deepEqual(parseSpokenLog(null).heard, []);
    assert.deepEqual(parseSpokenLog(undefined).values, EMPTY_PARSE.values);
  });

  test("the note field is never populated by the parser", () => {
    // The transcript becomes the note, and it does so in the component where the coach
    // can see it. A parser writing prose into a field would put unreviewed speech into
    // a document the upline's roll-up reads.
    assert.equal(parseSpokenLog("five shakes").values.note, null);
  });
});

describe("describeHeard", () => {
  test("describes what will be SAVED, not what was said", () => {
    // Quoting the transcript here would tell a coach the app understood something it
    // did not. The summary is built from the parse for that reason.
    const r = parseSpokenLog("five shakes and some invites");
    assert.equal(describeHeard(r), "5 shakes / servings");
  });

  test("empty when nothing was heard, so the screen can switch headings", () => {
    assert.equal(describeHeard(parseSpokenLog("hello")), "");
  });
});

describe("document ids and caps", () => {
  test("one note per coach per day", () => {
    // Same reasoning as the daily log's own id (D26, D35): re-recording corrects the
    // day rather than filing a second note, and a retried save on a weak signal
    // converges on one document.
    assert.equal(voiceLogDocId("usr_asha", "2026-08-12"), "usr_asha__2026-08-12");
  });

  test("an id that could escape its collection is refused", () => {
    assert.throws(() => voiceLogDocId("usr/../evil", "2026-08-12"));
    assert.throws(() => voiceLogDocId("usr_asha", ""));
  });

  test("the audio ceiling stays clear of Firestore's document limit", () => {
    // base64 costs a third on top. The encoded blob must sit well under 1 MiB or a
    // long note fails at save time with nothing the coach can do about it.
    const encoded = Math.ceil((MAX_AUDIO_BYTES * 4) / 3);
    assert.ok(encoded < 1024 * 1024 * 0.4, `encoded ceiling ${encoded} too close to 1 MiB`);
  });

  test("the recording is short enough to be a note, not a monologue", () => {
    assert.ok(MAX_DURATION_MS <= 20_000);
  });

  test("an uncounted note does not live forever", () => {
    assert.ok(UNCOUNTED_TTL_DAYS > 0 && UNCOUNTED_TTL_DAYS <= 90);
  });
});

describe("copy", () => {
  const sentences = (Object.values(copy) as unknown[]).filter(
    (v): v is string => typeof v === "string"
  );

  test("no income or earnings language anywhere (L4)", () => {
    // The easiest rule to break on a celebration screen. A saved log is a habit kept,
    // never a sum earned.
    const banned = /₹|rupee|earn|income|salary|payout|commission|profit|bonus/i;
    for (const s of sentences) {
      assert.ok(!banned.test(s), `income language in: ${s}`);
    }
  });

  test("no medical or clinical wording (L2, L3)", () => {
    const banned = /obese|overweight|underweight|normal weight|cholesterol|blood pressure|diagnos/i;
    for (const s of sentences) {
      assert.ok(!banned.test(s), `clinical language in: ${s}`);
    }
  });

  test("the screen states plainly that audio alone is not a log", () => {
    // This is the sentence that keeps the accountability loop intact. If it is ever
    // deleted for being wordy, this test is what stops the deletion.
    assert.match(copy.NOT_A_LOG_YET, /not your log/i);
    assert.match(copy.UNCOUNTED_FATE, /counts for nothing/i);
  });

  test("a failure is never described as the coach's fault", () => {
    // An app that says "you spoke unclearly" to someone standing on a road in traffic
    // will not be opened a second time.
    assert.match(copy.NOT_HEARD_BODY, /It happens/);
    assert.match(copy.NO_MIC_BODY, /Nothing is broken/);
  });

  test("partialBody lists the fields it could not pin a number to", () => {
    assert.equal(copy.partialBody([]), "");
    assert.match(copy.partialBody(["shakes"]), /mention shakes/);
    assert.match(copy.partialBody(["shakes", "invites"]), /shakes and invites/);
    assert.match(copy.partialBody(["a", "b", "c"]), /a, b and c/);
  });
});
