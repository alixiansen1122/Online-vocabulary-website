export const termKey = (term) => String(term || "").trim().toLowerCase().replace(/[^a-z]/g, "");

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

export function createFamilyLookup(words, morphemes, curated) {
  const byTerm = new Map(words.map((word) => [termKey(word.term), word]));
  const roots = new Map();
  for (const root of morphemes.roots) {
    for (const part of [root.m, ...(root.v || [])]) roots.set(part, { type: "词根", part, meaning: root.n, rootId: root.m });
  }
  const prefixes = morphemes.prefixes.map((p) => ({ type: "前缀", part: `${p.m}-`, meaning: p.n }));
  const suffixes = morphemes.suffixes.map((p) => ({ type: "后缀", part: `-${p.m}`, meaning: p.n }));
  const partCache = new Map();
  const denied = new Set(["interior", "internal", "interim", "internet", "university", "universal", "universe"]);

  function entry(term) {
    const key = termKey(term);
    const detail = curated.entries[key] || {};
    const book = byTerm.get(key);
    return { id: `family-${key}`, term, source: "拓展", ...detail, ...book, inBook: Boolean(book), familyDetail: detail };
  }

  function parts(word) {
    const key = termKey(word.term);
    if (curated.entries[key]?.parts) return curated.entries[key].parts;
    if (word.roots?.length) return word.roots.map((root) => {
      const type = root.note.includes("词根") ? "词根" : root.part.startsWith("-") ? "后缀" : "前缀";
      const normalized = termKey(root.part);
      return { type, part: root.part, meaning: root.note.replace(/^[^：]*：/, ""), rootId: roots.get(normalized)?.rootId || normalized };
    });
    if (partCache.has(key)) return partCache.get(key);
    if (!key || denied.has(key) || /\s/.test(word.term)) return [];
    const possiblePrefixes = [null, ...prefixes.filter((p) => key.startsWith(termKey(p.part)))];
    const possibleSuffixes = [null, ...suffixes.filter((p) => key.endsWith(termKey(p.part)))];
    let best = [];
    let score = -1;
    // Require the entire remaining stem to match; never attach a root on a substring alone.
    for (const prefix of possiblePrefixes) for (const suffix of possibleSuffixes) {
      const start = prefix ? termKey(prefix.part).length : 0;
      const end = key.length - (suffix ? termKey(suffix.part).length : 0);
      if (end - start < 3) continue;
      const stem = key.slice(start, end);
      let center = roots.has(stem) ? [roots.get(stem)] : null;
      if (!center && suffix && byTerm.has(stem) && stem !== key) center = [{ type: "词基", part: stem, meaning: byTerm.get(stem).meaning }];
      if (!center) for (let i = 3; i <= stem.length - 3; i++) {
        if (roots.has(stem.slice(0, i)) && roots.has(stem.slice(i))) { center = [roots.get(stem.slice(0, i)), roots.get(stem.slice(i))]; break; }
      }
      if (!center || (!prefix && !suffix && center.length === 1)) continue;
      const candidateScore = stem.length + center.filter((p) => p.type === "词根").length;
      if (candidateScore > score) { best = [prefix, ...center, suffix].filter(Boolean); score = candidateScore; }
    }
    partCache.set(key, best);
    return best;
  }

  function family(word) { return curated.families.find((item) => item.terms.includes(word.term.toLowerCase())); }

  function derivatives(word, fallback = []) {
    const known = family(word);
    const source = known ? known.derivatives.map(entry) : fallback;
    const rows = source.some((item) => termKey(item.term) === termKey(word.term)) ? source : [word, ...source];
    if (rows.length < 2) return [];
    return rows.map((item) => {
      const resolved = { ...entry(item.term), ...item };
      const detail = curated.entries[termKey(item.term)];
      return { ...resolved, parts: parts(resolved), highlights: detail?.derivativeHighlights || parts(resolved).filter((p) => p.type === "前缀" || p.type === "后缀").map((p) => termKey(p.part)) };
    });
  }

  function rootGroups(word) {
    const known = family(word);
    if (known) {
      const groups = known.groups.map((group) => ({ ...group, words: group.terms.map((term) => {
        const item = entry(term); return { ...item, ...item.familyDetail, parts: parts(item), highlights: item.familyDetail.rootHighlights || [] };
      }) }));
      if (!groups.some((group) => group.words.some((item) => termKey(item.term) === termKey(word.term)))) {
        groups.unshift({ id: `current-${word.id}`, words: [{ ...word, parts: parts(word), highlights: [] }] });
      }
      return groups;
    }
    const currentParts = parts(word);
    if (!currentParts.length) return [];
    const rootIds = new Set(currentParts.filter((p) => p.type === "词根").map((p) => p.rootId || termKey(p.part)));
    const relatives = rootIds.size ? words.filter((item) => item.id !== word.id && parts(item).some((p) => p.type === "词根" && rootIds.has(p.rootId || termKey(p.part)))).slice(0, 7) : [];
    return [{ id: word.id, words: [word, ...relatives].map((item) => {
      const decomposition = parts(item);
      return { ...item, inBook: byTerm.has(termKey(item.term)), parts: decomposition, highlights: decomposition.filter((p) => p.type === "词根").map((p) => termKey(p.part)) };
    }) }];
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
