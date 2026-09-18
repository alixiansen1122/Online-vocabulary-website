import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createSynonymLookup } from "./synonyms.js";
const read = name => JSON.parse(fs.readFileSync(new URL(`./data/${name}.json`,import.meta.url)));
const words = read("bbdc-yszch").chapters.flatMap(chapter=>chapter.words);
const reviewed = read("reviewed-synonyms");
const lookup = createSynonymLookup(words,reviewed);
const find = term => words.find(word=>word.term === term);

test("every original synonym suggestion has an explicit review decision", () => {
  const original = words.flatMap(word=>(word.synonyms||[]).map(candidate=>`${word.term}|${candidate}`)).sort();
  assert.deepEqual(reviewed.audit.map(row=>`${row.word}|${row.candidate}`).sort(),original);
  assert.ok(reviewed.audit.every(row=>row.reason && ["keep","remove"].includes(row.decision)));
});

test("chemical symbols, coordinate lines and broad related concepts are excluded", () => {
  for (const term of ["oxygen","hydrogen","longitude","lithosphere","carbon dioxide"]) assert.deepEqual(lookup(find(term)),[],term);
  assert.ok(!lookup(find("core")).some(row=>["homer","omer","effect"].includes(row.term)));
  assert.ok(!lookup(find("catastrophic")).some(row=>row.term === "harmful"));
  assert.ok(!lookup(find("mantle")).some(row=>["mantel","mantlepiece"].includes(row.term)));
});

test("sense-specific lookup rejects unrelated homographs and unreviewed imports", () => {
  assert.deepEqual(lookup({term:"crust",meaning:"地壳"}),[]);
  assert.deepEqual(lookup({term:"core",meaning:"果核"}),[]);
  assert.deepEqual(lookup({term:"latitude",meaning:"纬度"}),[]);
  assert.deepEqual(lookup({term:"unknown",meaning:"未知",synonyms:["known"]}),[]);
  assert.ok(lookup({term:"latitude",meaning:"自由；余地"}).some(row=>row.term === "leeway"));
});

test("all displayed synonyms have an actual gloss, sense, usage and unique term", () => {
  for (const word of words) {
    const rows=lookup(word);
    assert.equal(new Set(rows.map(row=>row.term.toLowerCase())).size,rows.length);
    for (const row of rows) {
      assert.ok(row.meaning && row.pos && row.sense && row.usage,`${word.term} / ${row.term}`);
      assert.notEqual(row.term.toLowerCase(),word.term.toLowerCase());
    }
  }
});
