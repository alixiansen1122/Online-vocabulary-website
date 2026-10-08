import test from "node:test";
import assert from "node:assert/strict";
import { mergeSpellingRecords, needsSpellingReview, normalizeSpellingRecords, recordSpellingAttempt, spellingFeedback } from "./spellingRecords.js";

const DAY = 24 * 60 * 60 * 1000;

test("only completed spellings count; case is preserved and wrong positions are specific", () => {
  assert.equal(spellingFeedback("Atmo", "atmosphere").complete, false);
  assert.deepEqual(spellingFeedback("Atmozphere", "atmosphere").wrongIndices, [4]);
  assert.equal(spellingFeedback("Atmosphere", "atmosphere").correct, true);
  assert.equal(spellingFeedback("Atmosphere", "atmosphere", true).firstTry, false);
});

test("wrong then corrected remains pending until a fresh review succeeds first try", () => {
  let records = recordSpellingAttempt({}, "word", spellingFeedback("cot", "cat"), false, 10);
  assert.equal(needsSpellingReview(records.word, 10), true);
  records = recordSpellingAttempt(records, "word", spellingFeedback("cat", "cat", true), true, 11);
  assert.equal(needsSpellingReview(records.word, 11), true);
  assert.equal(records.word.retryCorrect, 1);
  records = recordSpellingAttempt(records, "word", spellingFeedback("Cat", "cat"), true, 12);
  assert.equal(needsSpellingReview(records.word, 12), false);
  assert.equal(records.word.reviewStage, 1);
  assert.equal(records.word.nextReviewAt, 12 + DAY);
  assert.equal(needsSpellingReview(records.word, 12 + DAY), true);
  assert.equal(records.word.firstTryCorrect, 1);
  assert.equal(records.word.errors, 1);
  assert.equal(records.word.attempts, 3);
  assert.equal(records.word.lastWrongInput, "cot");
  records = recordSpellingAttempt(records, "word", spellingFeedback("cut", "cat"), false, 12);
  assert.equal(needsSpellingReview(records.word, 13), true);
  assert.equal(records.word.reviewStage, 0);
});

test("successful due reviews follow the 1, 3, 7, 14 and 30 day schedule", () => {
  let records = recordSpellingAttempt({}, "word", spellingFeedback("cat", "cat"), false, 100);
  assert.equal(records.word.reviewStage, 1);
  assert.equal(records.word.nextReviewAt, 100 + DAY);
  records = recordSpellingAttempt(records, "word", spellingFeedback("cat", "cat"), true, 100 + DAY);
  assert.equal(records.word.reviewStage, 2);
  assert.equal(records.word.nextReviewAt, 100 + DAY + 3 * DAY);
  records = recordSpellingAttempt(records, "word", spellingFeedback("cat", "cat"), true, records.word.nextReviewAt);
  assert.equal(records.word.reviewStage, 3);
  assert.equal(records.word.nextReviewAt, 100 + DAY + 3 * DAY + 7 * DAY);
});

test("backup roundtrip and merging old offline data do not resurrect cleared mistakes", () => {
  const wrong = recordSpellingAttempt({}, "word", spellingFeedback("cot", "cat"), false, 100);
  const cleared = recordSpellingAttempt(wrong, "word", spellingFeedback("cat", "cat"), true, 200);
  assert.deepEqual(normalizeSpellingRecords(JSON.parse(JSON.stringify(cleared))), cleared);
  assert.equal(needsSpellingReview(mergeSpellingRecords(cleared, wrong).word, 200), false);
  assert.equal(needsSpellingReview(mergeSpellingRecords(wrong, cleared).word, 200), false);
  const newerMistake = recordSpellingAttempt(wrong, "word", spellingFeedback("cut", "cat"), false, 300);
  assert.equal(needsSpellingReview(mergeSpellingRecords(cleared, newerMistake).word, 300), true);
});

test("old and malformed backups have safe defaults", () => {
  assert.deepEqual(normalizeSpellingRecords(undefined), {});
  assert.deepEqual(normalizeSpellingRecords([]), {});
  const normalized = normalizeSpellingRecords({ valid: { errors: -3, attempts: "7", lastWrongInput: 3 }, invalid: null });
  assert.equal(normalized.valid.errors, 0);
  assert.equal(normalized.valid.attempts, 0);
  assert.equal(normalized.valid.lastWrongInput, "");
  assert.equal(normalized.invalid, undefined);
});
