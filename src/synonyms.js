const keyFor = (term) => String(term || "").trim().toLowerCase().replace(/\s+/g, " ");

// Only sense-specific reviewed pairs may enter the UI. Imported suggestions,
// abbreviations and merely related words are never trusted.
export function createSynonymLookup(words, reviewed) {
  const byTerm = new Map(words.map((word) => [keyFor(word.term), word]));
  return (word) => {
    const key = keyFor(word.term);
    const record = reviewed.entries[key];
    if (!record) return [];
    const meaning = String(word.meaning || word.rawMeaning || "");
    const seen = new Set([key]);
    return record.items.filter((item) => {
      const candidate = keyFor(item.term);
      if (!candidate || seen.has(candidate) || !item.meaning || !item.sense || !item.pos) return false;
      // Prevent the main book's reviewed sense leaking into a custom homograph.
      if (!item.matches.some((sense) => meaning.includes(sense))) return false;
      seen.add(candidate);
      return true;
    }).map((item) => ({ ...item, inBook: byTerm.has(keyFor(item.term)) }));
  };
}
