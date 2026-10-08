const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const DAY_MS = 24 * 60 * 60 * 1000;
export const SPELLING_REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30];

function reviewStage(value) {
  return Math.min(SPELLING_REVIEW_INTERVAL_DAYS.length, count(value));
}

export function normalizeSpellingRecords(value) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, record]) => id.length <= 200 && isRecord(record)).slice(0, 10000).map(([id, record]) => [id, {
    attempts: count(record.attempts),
    errors: count(record.errors),
    firstTryCorrect: count(record.firstTryCorrect),
    retryCorrect: count(record.retryCorrect),
    lastAttemptAt: count(record.lastAttemptAt),
    lastWrongAt: count(record.lastWrongAt),
    clearedAt: count(record.clearedAt),
    reviewStage: reviewStage(record.reviewStage),
    nextReviewAt: count(record.nextReviewAt),
    lastReviewAt: count(record.lastReviewAt),
    lastWrongInput: typeof record.lastWrongInput === "string" ? record.lastWrongInput.slice(0, 200) : "",
  }]));
}

export function needsSpellingReview(record, timestamp = Date.now()) {
  if (!record) return false;
  if (record.lastWrongAt > record.clearedAt) return true;
  return record.nextReviewAt > 0 && record.nextReviewAt <= timestamp;
}

export function hasScheduledSpellingReview(record) {
  return Boolean(record?.nextReviewAt > 0);
}

// One completed answer is recorded once; re-renders and audio playback never record answers.
export function recordSpellingAttempt(records, wordId, result, review = false, timestamp = Date.now()) {
  const previous = normalizeSpellingRecords({ [wordId]: records?.[wordId] })[wordId] || {
    attempts: 0, errors: 0, firstTryCorrect: 0, retryCorrect: 0,
    lastAttemptAt: 0, lastWrongAt: 0, clearedAt: 0, reviewStage: 0,
    nextReviewAt: 0, lastReviewAt: 0, lastWrongInput: "",
  };
  const now = Math.max(timestamp, previous.lastAttemptAt + 1);
  const next = {
    ...previous,
    attempts: previous.attempts + 1,
    errors: previous.errors + Number(!result.correct),
    firstTryCorrect: previous.firstTryCorrect + Number(result.correct && result.firstTry),
    retryCorrect: previous.retryCorrect + Number(result.correct && !result.firstTry),
    lastAttemptAt: now,
  };
  if (!result.correct) {
    next.lastWrongAt = now;
    next.lastWrongInput = result.input.slice(0, 200);
    next.reviewStage = 0;
    next.nextReviewAt = now;
  } else if (result.firstTry) {
    const pendingMistake = previous.lastWrongAt > previous.clearedAt;
    const due = previous.nextReviewAt === 0 || previous.nextReviewAt <= now;
    if (review || (!pendingMistake && due)) {
      const stage = Math.min(previous.reviewStage + 1, SPELLING_REVIEW_INTERVAL_DAYS.length);
      next.reviewStage = stage;
      next.lastReviewAt = now;
      next.nextReviewAt = now + SPELLING_REVIEW_INTERVAL_DAYS[stage - 1] * DAY_MS;
      if (review) next.clearedAt = now;
    }
  }
  return { ...records, [wordId]: next };
}

export function mergeSpellingRecords(cloudValue, localValue) {
  const cloud = normalizeSpellingRecords(cloudValue);
  const local = normalizeSpellingRecords(localValue);
  const merged = { ...cloud };
  for (const [id, record] of Object.entries(local)) {
    const remote = cloud[id];
    if (!remote) { merged[id] = record; continue; }
    const latest = record.lastAttemptAt >= remote.lastAttemptAt ? record : remote;
    merged[id] = { ...latest,
      lastWrongAt: Math.max(record.lastWrongAt, remote.lastWrongAt),
      lastWrongInput: record.lastWrongAt >= remote.lastWrongAt ? record.lastWrongInput : remote.lastWrongInput,
      clearedAt: Math.max(record.clearedAt, remote.clearedAt),
    };
  }
  return merged;
}

export function spellingFeedback(input, target, hadError = false) {
  const complete = target.length > 0 && input.length === target.length;
  const wrongIndices = [...input].flatMap((letter, index) => letter.toLowerCase() !== target[index] ? [index] : []);
  return { input, complete, correct: complete && wrongIndices.length === 0, firstTry: !hadError, wrongIndices };
}
