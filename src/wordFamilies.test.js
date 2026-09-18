import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createFamilyLookup, highlightedSegments, normalizeFamilyWords } from "./wordFamilies.js";

const read = (name) => JSON.parse(fs.readFileSync(new URL(`./data/${name}.json`, import.meta.url), "utf8"));
const words = read("bbdc-yszch").chapters.flatMap((chapter) => chapter.words);
const curated = read("word-families");
const lookup = createFamilyLookup(words, curated);
const oxide = words.find((word) => word.term === "oxide");

test("derivatives have real meanings and do not mix unrelated historical cousins", () => {
  const rows = lookup.derivatives(oxide);
  assert.ok(rows.some((row) => row.term === "oxidation"));
  assert.ok(rows.some((row) => row.term === "antioxidant"));
  assert.ok(!rows.some((row) => ["oxygen", "oxymoron", "paroxysm"].includes(row.term)));
  assert.equal(rows.filter((row) => row.id === oxide.id).length, 1);
  assert.equal(lookup.entry("oxygenate").inBook, false);
  for (const group of lookup.rootGroups(oxide)) for (const word of group.words) {
    assert.ok(word.id && word.meaning && word.parts.length);
  }
});

test("derivative highlighting marks the affixes, root highlighting marks the roots", () => {
  const row = lookup.derivatives(oxide).find((word) => word.term === "dioxide");
  assert.deepEqual(highlightedSegments(row.term, row.highlights).filter((p) => p.highlight).map((p) => p.text), ["di"]);
  const root = lookup.rootGroups(oxide)[0].words.find((word) => word.term === "oxygen");
  assert.deepEqual(highlightedSegments(root.term, root.highlights).filter((p) => p.highlight).map((p) => p.text), ["oxy", "gen"]);
});

test("unsupported words and lookalike stems never receive invented relations", () => {
  const atmosphere = words.find((word) => word.term === "atmosphere");
  assert.ok(lookup.rootGroups(atmosphere)[0].words.some((word) => word.term === "hydrosphere"));
  assert.deepEqual(lookup.rootGroups({ id: "custom", term: "xyzunknown", roots: [] }), []);
  assert.deepEqual(lookup.parts({ term: "university" }), []);
  assert.deepEqual(lookup.derivatives({term:"category"}), []);
  assert.ok(!lookup.derivatives({term:"act"}).some(word=>word.term === "actual"));
  assert.ok(!lookup.rootGroups({term:"transport"}).flatMap(group=>group.words).some(word=>word.term === "proportion"));
});

test("all explicit families resolve to unique entries with useful meanings and complete parts", () => {
  for (const family of curated.families) {
    for (const term of family.terms) {
      const rows = lookup.derivatives({term});
      assert.equal(new Set(rows.map(row=>row.id)).size, rows.length, term);
      for (const row of rows) {
        assert.ok(row.meaning && row.pos, row.term);
        assert.ok(!/派生含义|所在词条意思相近/.test(row.meaning), row.term);
        assert.ok(row.parts.every(part=>part.part && part.type && part.meaning), row.term);
      }
    }
  }
});

test("deep derivatives retain current word and access the wider root group", () => {
  const word = lookup.entry("reconstruction");
  const groups = lookup.rootGroups(word);
  assert.ok(groups.some(group => group.id === "struct"));
  assert.ok(groups.every(group => group.words.some(row => row.id === word.id)));
  assert.ok(groups.flatMap(group=>group.words).some(row => row.term === "destruction"));
  assert.ok(lookup.rootGroups(lookup.entry("carbon dioxide"))[0].words.some(row=>row.term === "carbon dioxide"));
});

test("root and affix topics contain complete, unique, pronounceable entries", () => {
  for (const group of curated.rootGroups) {
    assert.equal(new Set(group.terms).size,group.terms.length,group.id);
    for (const term of group.terms) {
      const entry=lookup.entry(term);
      assert.ok(entry.meaning && entry.pos && lookup.parts(entry).length,`${group.id}: ${term}`);
      assert.match(entry.term,/^[a-z]+(?:[ -][a-z]+)*$/i);
    }
  }
  assert.ok(lookup.rootGroups(lookup.entry("teacher")).some(group=>group.id === "suffix-person"));
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
