import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createFamilyLookup, highlightedSegments, normalizeFamilyWords } from "./wordFamilies.js";

const read = (name) => JSON.parse(fs.readFileSync(new URL(`./data/${name}.json`, import.meta.url), "utf8"));
const words = read("bbdc-yszch").chapters.flatMap((chapter) => chapter.words);
const lookup = createFamilyLookup(words, read("morphemes"), read("word-families"));
const oxide = words.find((word) => word.term === "oxide");

test("reference word family includes current word, real book badges and both root groups", () => {
  const rows = lookup.derivatives(oxide);
  assert.deepEqual(rows.map((row) => row.term), ["oxygen", "dioxide", "oxide", "oxygenate"]);
  assert.equal(rows.filter((row) => row.id === oxide.id).length, 1);
  assert.equal(rows.find((row) => row.term === "oxygenate").inBook, false);
  assert.deepEqual(lookup.rootGroups(oxide).map((group) => group.words.map((word) => word.term)), [["oxide", "oxidize", "dioxide"], ["oxygen", "oxymoron", "paroxysm"]]);
  for (const group of lookup.rootGroups(oxide)) for (const word of group.words) {
    assert.ok(word.id && word.meaning && word.parts.length);
  }
});

test("derivative highlighting marks the affixes, root highlighting marks the roots", () => {
  const row = lookup.derivatives(oxide).find((word) => word.term === "dioxide");
  assert.deepEqual(highlightedSegments(row.term, row.highlights).filter((p) => p.highlight).map((p) => p.text), ["di", "ide"]);
  const root = lookup.rootGroups(oxide)[0].words.find((word) => word.term === "dioxide");
  assert.deepEqual(highlightedSegments(root.term, root.highlights).filter((p) => p.highlight).map((p) => p.text), ["ox"]);
});

test("other words use whole-stem matching and unsupported words have an empty state", () => {
  const atmosphere = words.find((word) => word.term === "atmosphere");
  assert.ok(lookup.rootGroups(atmosphere)[0].words.some((word) => word.term === "hydrosphere"));
  assert.deepEqual(lookup.rootGroups({ id: "custom", term: "xyzunknown", roots: [] }), []);
  assert.deepEqual(lookup.parts({ term: "university" }), []);
});

test("outside-book favorites keep a stable id and survive JSON backup normalization", () => {
  const entry = lookup.entry("oxymoron");
  const normalized = normalizeFamilyWords([entry, entry]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].id, entry.id);
  assert.equal(normalized[0].meaning, entry.meaning);
  assert.deepEqual(normalizeFamilyWords(JSON.parse(JSON.stringify(normalized))), normalized);
  assert.deepEqual(normalizeFamilyWords(undefined), []);
});
