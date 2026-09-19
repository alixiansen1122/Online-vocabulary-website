export const MAX_EXAMPLES = 10;
export const MIN_EXAMPLES = 3;

export function normalizedSentence(value) {
  return String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export function containsTerm(sentence, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-zA-Z])${escaped}(?=$|[^a-zA-Z])`, "i").test(sentence);
}

export function mergeBilingualExamples(remoteExamples, localExamples = [], limit = MAX_EXAMPLES) {
  const english = new Set();
  const chinese = new Set();
  const merged = [];
  if (limit <= 0) return merged;
  for (const example of [...remoteExamples, ...localExamples]) {
    if (!example || typeof example.en !== "string" || typeof example.zh !== "string") continue;
    if (!/[a-zA-Z]/.test(example.en) || !/\p{Script=Han}/u.test(example.zh)) continue;
    const en = normalizedSentence(example.en);
    const zh = normalizedSentence(example.zh);
    if (!en || !zh || english.has(en) || chinese.has(zh)) continue;
    english.add(en);
    chinese.add(zh);
    merged.push(example);
    if (merged.length >= Math.min(limit, MAX_EXAMPLES)) break;
  }
  return merged;
}

function tokens(text, term) {
  const excluded = new Set(term.toLowerCase().split(/\s+/));
  return new Set(text.toLowerCase().match(/[a-z]+/g)?.filter(token => token.length > 2 && !excluded.has(token)) || []);
}

function similarity(a, b) {
  const overlap = [...a].filter(token => b.has(token)).length;
  return overlap / (a.size + b.size - overlap || 1);
}

export function selectExamples(candidates, term) {
  const remaining = candidates.filter(item => {
    const length = item.en?.trim().split(/\s+/).length || 0;
    return length >= 3 && length <= 40 && containsTerm(item.en, term) && !/…|\.{3}/.test(item.en)
      && mergeBilingualExamples([item]).length;
  });
  const selected = [];
  while (remaining.length && selected.length < MAX_EXAMPLES) {
    const ranked = remaining.map((item, index) => {
      const words = item.en.trim().split(/\s+/).length;
      const closest = Math.max(0, ...selected.map(other => similarity(tokens(item.en, term), tokens(other.en, term))));
      const duplicate = selected.some(other => normalizedSentence(other.en) === normalizedSentence(item.en)
        || normalizedSentence(other.zh) === normalizedSentence(item.zh)) || closest >= 0.9;
      return { index, duplicate, score: (words >= 5 && words <= 20 ? 16 : 8) + (item.isDirect ? 4 : 0)
        + (selected.some(other => other.source === item.source) ? 0 : 5) - closest * 25 };
    }).filter(item => !item.duplicate).sort((a, b) => b.score - a.score);
    if (!ranked.length) break;
    selected.push(remaining.splice(ranked[0].index, 1)[0]);
  }
  return selected.map(({ isDirect, ...example }) => example);
}
