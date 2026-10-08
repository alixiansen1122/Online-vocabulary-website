import test from "node:test";
import assert from "node:assert/strict";
import { buildMemoryImagePrompt, fallbackMemoryPlan, memoryImageCacheSource, normalizeMemoryWord, sanitizeMemoryPlan } from "./memoryImage.js";

const word = { term: "resilience", pos: "n.", meaning: "韧性；复原力" };

test("memory-image words are normalized and unsafe or incomplete input is rejected", () => {
  assert.deepEqual(normalizeMemoryWord({ term: "  take   off ", pos: " phr. ", meaning: " 起飞；脱下 " }), {
    term: "take off", pos: "phr.", meaning: "起飞；脱下",
  });
  assert.equal(normalizeMemoryWord({ term: "<script>", meaning: "bad" }), null);
  assert.equal(normalizeMemoryWord({ term: "valid" }), null);
});

test("the cache source changes with the current sense", () => {
  assert.notEqual(memoryImageCacheSource(word), memoryImageCacheSource({ ...word, meaning: "恢复能力" }));
});

test("plans always provide aligned explanations and image prompts without image text", () => {
  const fallback = fallbackMemoryPlan(word);
  const sanitized = sanitizeMemoryPlan({ sceneTitle: "", explanation: "暴风雨后的树重新挺立。" }, word);
  assert.equal(sanitized.sceneTitle, fallback.sceneTitle);
  assert.equal(sanitized.explanation, "暴风雨后的树重新挺立。");
  const prompt = buildMemoryImagePrompt(word, sanitized);
  assert.match(prompt, /resilience/);
  assert.match(prompt, /Avoid: all written words/);
});
