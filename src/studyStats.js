const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function chinaDateKey(timestamp = Date.now()) {
  const date = new Date(Number(timestamp));
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(safeDate);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function shiftDateKey(dateKey, days) {
  if (!DATE_KEY.test(String(dateKey || ""))) return "";
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

export function calculateStreaks(dateKeys, today = chinaDateKey()) {
  const dates = [...new Set((dateKeys || []).filter((value) => DATE_KEY.test(String(value))))].sort();
  if (!dates.length) return { current: 0, longest: 0, activeDays: 0 };

  let longest = 1;
  let run = 1;
  for (let index = 1; index < dates.length; index += 1) {
    if (dates[index] === shiftDateKey(dates[index - 1], 1)) run += 1;
    else run = 1;
    longest = Math.max(longest, run);
  }

  const latest = dates.at(-1);
  let current = latest === today || latest === shiftDateKey(today, -1) ? 1 : 0;
  if (current) {
    for (let index = dates.length - 2; index >= 0; index -= 1) {
      if (dates[index] !== shiftDateKey(dates[index + 1], -1)) break;
      current += 1;
    }
  }
  return { current, longest, activeDays: dates.length };
}

export function summarizeDays(days) {
  return (days || []).reduce((summary, day) => ({
    activeDays: summary.activeDays + 1,
    wordViews: summary.wordViews + Number(day.wordViews || 0),
    spellingAttempts: summary.spellingAttempts + Number(day.spellingAttempts || 0),
    correct: summary.correct + Number(day.correct || 0),
    wrong: summary.wrong + Number(day.wrong || 0),
    firstTryCorrect: summary.firstTryCorrect + Number(day.firstTryCorrect || 0),
    retryCorrect: summary.retryCorrect + Number(day.retryCorrect || 0),
    reviewAttempts: summary.reviewAttempts + Number(day.reviewAttempts || 0),
    reviewCorrect: summary.reviewCorrect + Number(day.reviewCorrect || 0),
  }), {
    activeDays: 0,
    wordViews: 0,
    spellingAttempts: 0,
    correct: 0,
    wrong: 0,
    firstTryCorrect: 0,
    retryCorrect: 0,
    reviewAttempts: 0,
    reviewCorrect: 0,
  });
}
