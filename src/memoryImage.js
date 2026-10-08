const TERM_PATTERN = /^[a-z][a-z '-]{0,79}$/i;

function cleanText(value, limit) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}

export function normalizeMemoryWord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const term = cleanText(value.term, 80);
  const pos = cleanText(value.pos, 60);
  const meaning = cleanText(value.meaning, 800);
  if (!TERM_PATTERN.test(term) || !meaning) return null;
  return { term, pos, meaning };
}

export function memoryImageCacheSource(word) {
  return [word.term.toLowerCase(), word.pos.toLowerCase(), word.meaning].join("\n");
}

export function fallbackMemoryPlan(word) {
  const sense = `${word.pos ? `${word.pos} ` : ""}${word.meaning}`.trim();
  return {
    sceneTitle: `${word.term} 的视觉记忆场景`,
    sceneDescription: `用一个清晰、具体的场景表现“${sense}”，让主体的动作、状态与环境共同传达这个词的核心含义。`,
    explanation: `画面的核心场景对应当前义项“${sense}”。先回忆画面表达的概念，再说出 ${word.term}，可以把图像、含义和拼写连接起来。`,
    memoryTip: `看到画面时先说 ${word.term}，再按字母顺序拼写一遍。`,
    imagePrompt: `A single clear, memorable scene that visually demonstrates the English vocabulary concept “${word.term}”, meaning “${word.meaning}”. Make the central action or state immediately understandable and semantically accurate.`,
  };
}

export function sanitizeMemoryPlan(value, word) {
  const fallback = fallbackMemoryPlan(word);
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  return {
    sceneTitle: cleanText(value.sceneTitle, 80) || fallback.sceneTitle,
    sceneDescription: cleanText(value.sceneDescription, 400) || fallback.sceneDescription,
    explanation: cleanText(value.explanation, 600) || fallback.explanation,
    memoryTip: cleanText(value.memoryTip, 240) || fallback.memoryTip,
    imagePrompt: cleanText(value.imagePrompt, 1600) || fallback.imagePrompt,
  };
}

export function buildMemoryImagePrompt(word, plan) {
  return [
    "Use case: scientific-educational",
    "Asset type: visual vocabulary memory card",
    `Primary request: ${plan.imagePrompt}`,
    `Vocabulary sense to preserve: ${word.term} — ${word.pos} ${word.meaning}`,
    "Style/medium: polished editorial illustration with natural depth, friendly but not childish",
    "Composition/framing: square composition, one unmistakable focal scene, subject large enough to understand at thumbnail size",
    "Lighting/mood: clear, vivid, memorable, emotionally appropriate to the meaning",
    "Constraints: the scene must match only the supplied vocabulary sense; culturally neutral; suitable for language learning",
    "Avoid: all written words, letters, captions, labels, signs, logos, watermarks, split panels, decorative borders, unrelated symbolism",
  ].join("\n");
}
