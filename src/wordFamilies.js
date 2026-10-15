export const termKey = (term) => String(term || "").trim().toLowerCase().replace(/[^a-z]/g, "");

function shortMeaning(value, limit = 42) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function buildMemory(item, decomposition) {
  if (!decomposition.length) return item.memory || "";
  const formula = decomposition.map((part) => `${part.part}（${shortMeaning(part.meaning, 28)}）`).join(" + ");
  const semanticBridge = decomposition.map((part) => shortMeaning(part.meaning, 16)).join(" + ");
  const guide = `${formula}。先按“${semanticBridge}”理解构词，再联想到“${shortMeaning(item.meaning, 54)}”。`;
  const contextualNote = /词源|源于|历史|旧|古|并非|不是|注意|拼写|变化/.test(item.memory || "");
  return contextualNote ? `${guide}补充：${item.memory}` : guide;
}

export function normalizeFamilyWords(value) {
  if (!Array.isArray(value)) return [];
  const words = new Map();
  for (const item of value.slice(0, 3000)) {
    if (!item || typeof item.term !== "string" || typeof item.meaning !== "string") continue;
    const key = termKey(item.term);
    if (!key || key.length > 100) continue;
    words.set(key, { id: `family-${key}`, term: item.term.slice(0, 150), pos: typeof item.pos === "string" ? item.pos.slice(0, 30) : "", meaning: item.meaning.slice(0, 2000), source: "拓展", roots: [] });
  }
  return [...words.values()];
}

// Shared spelling alone is not evidence of derivation. Use explicit relations;
// homographic roots such as port (carry) / port (part) must remain distinct.
export function createFamilyLookup(words, curated) {
  const byTerm = new Map(words.map((word) => [termKey(word.term), word]));
  const familiesByTerm = new Map();
  const groupsByTerm = new Map();
  for (const family of curated.families) {
    for (const term of family.terms) {
      const key = termKey(term);
      if (!familiesByTerm.has(key)) familiesByTerm.set(key, []);
      familiesByTerm.get(key).push(family);
    }
  }
  for (const group of curated.rootGroups || []) {
    for (const term of new Set([...group.terms, ...(group.relatedTerms || [])])) {
      const key = termKey(term);
      if (!groupsByTerm.has(key)) groupsByTerm.set(key, []);
      groupsByTerm.get(key).push(group);
    }
  }
  function entry(term) {
    const key = termKey(term);
    const detail = curated.entries[key] || {};
    const book = byTerm.get(key);
    return { term, ...book, ...detail, id: book?.id || `family-${key}`, inBook: Boolean(book), source: book?.source || "拓展" };
  }
  function parts(word) {
    return curated.entries[termKey(word.term)]?.parts || [];
  }
  function decorate(item, mode) {
    const resolved = { ...item, ...entry(item.term) };
    const decomposition = parts(resolved);
    return { ...resolved, parts: decomposition, memory: buildMemory(resolved, decomposition), highlights: (mode === "roots" ? resolved.rootHighlights : resolved.derivativeHighlights) || decomposition.filter((part) => mode === "roots" ? part.type === "词根" || part.type === "词基" : part.type === "前缀" || part.type === "后缀").map((part) => termKey(part.part)) };
  }
  function derivatives(word) {
    const families = familiesByTerm.get(termKey(word.term)) || [];
    const terms = [...new Set(families.flatMap((family) => family.derivatives))];
    if (!terms.length) return [];
    if (!terms.some((term) => termKey(term) === termKey(word.term))) terms.unshift(word.term);
    return terms.map((term) => decorate(termKey(term) === termKey(word.term) ? word : entry(term), "derivatives")).filter((item) => item.meaning);
  }
  function rootGroups(word) {
    const groups = groupsByTerm.get(termKey(word.term)) || [];
    if (groups.length) return groups.map((group) => {
      const terms = group.terms.some((term) => termKey(term) === termKey(word.term)) ? group.terms : [word.term, ...group.terms];
      return { ...group, words: terms.map((term) => decorate(termKey(term) === termKey(word.term) ? word : entry(term), "roots")) };
    });
    const rows = derivatives(word);
    const current = decorate(word, "roots");
    if (!current.parts.length && rows.length === 0) return [];
    return [{ id: `family-${termKey(word.term)}`, title: "词基与词缀拓展", description: "从词基到派生形式，查看构词关系和各部分含义。", words: rows.length ? rows : [current] }];
  }
  return { entry, parts, derivatives, rootGroups };
}

export function highlightedSegments(term, highlights) {
  const parts = [...new Set(highlights.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!parts.length) return [{ text: term, highlight: false }];
  const escaped = parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "ig");
  return term.split(regex).filter(Boolean).map((text) => ({ text, highlight: parts.some((part) => part.toLowerCase() === text.toLowerCase()) }));
}
