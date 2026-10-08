import test from "node:test";
import assert from "node:assert/strict";
import { calculateStreaks, shiftDateKey, summarizeDays } from "./studyStats.js";

test("date keys shift across month and year boundaries", () => {
  assert.equal(shiftDateKey("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftDateKey("2026-02-28", 1), "2026-03-01");
});

test("streaks allow today or yesterday as the current run", () => {
  const dates = ["2026-10-01", "2026-10-02", "2026-10-04", "2026-10-05", "2026-10-06"];
  assert.deepEqual(calculateStreaks(dates, "2026-10-06"), { current: 3, longest: 3, activeDays: 5 });
  assert.equal(calculateStreaks(dates, "2026-10-07").current, 3);
  assert.equal(calculateStreaks(dates, "2026-10-08").current, 0);
});

test("daily summaries add every tracked learning metric", () => {
  assert.deepEqual(summarizeDays([
    { wordViews: 3, spellingAttempts: 2, correct: 1, wrong: 1, firstTryCorrect: 1, retryCorrect: 0, reviewAttempts: 1, reviewCorrect: 0 },
    { wordViews: 4, spellingAttempts: 1, correct: 1, wrong: 0, firstTryCorrect: 0, retryCorrect: 1, reviewAttempts: 1, reviewCorrect: 1 },
  ]), {
    activeDays: 2, wordViews: 7, spellingAttempts: 3, correct: 2, wrong: 1,
    firstTryCorrect: 1, retryCorrect: 1, reviewAttempts: 2, reviewCorrect: 1,
  });
});
