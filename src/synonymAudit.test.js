import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (name) => JSON.parse(fs.readFileSync(new URL(`./data/${name}.json`, import.meta.url), "utf8"));
const words = read("bbdc-yszch").chapters.flatMap((chapter) => chapter.words);
const details = read("synonym-details");
const rejected = new Set(["atm", "o", "h", "homer", "omer", "crustcore", "stenchcore", "mantel", "mantlepiece", "el", "alt", "nakba", "queer", "scupper", "packaging agent"]);

test("all 3673 words have an audited synonym list and every shown synonym has a Chinese meaning", () => {
  assert.equal(words.length, 3673);
  for (const word of words) {
    assert.ok(Array.isArray(word.synonyms), `${word.term} is missing its synonym audit`);
    assert.equal(new Set(word.synonyms).size, word.synonyms.length, `${word.term} has duplicate synonyms`);
    for (const synonym of word.synonyms) {
      assert.notEqual(synonym.toLowerCase(), word.term.toLowerCase(), `${word.term} lists itself`);
      assert.ok(details[synonym]?.meaning, `${word.term} -> ${synonym} has no Chinese meaning`);
      assert.match(details[synonym].meaning, /[\u3400-\u9fff]/, `${word.term} -> ${synonym} has no Chinese explanation`);
      assert.ok(!rejected.has(synonym), `${word.term} kept rejected noise: ${synonym}`);
    }
  }
});

test("known noisy lists are replaced by reviewed semantic matches", () => {
  const byTerm = new Map(words.map((word) => [word.term, word]));
  assert.deepEqual(byTerm.get("mishap").synonyms, ["mischance", "misadventure", "bad luck"]);
  assert.deepEqual(byTerm.get("core").synonyms, ["crux", "gist", "essence", "pith", "substance"]);
  assert.deepEqual(byTerm.get("oxygen").synonyms, []);
  assert.deepEqual(byTerm.get("endanger").synonyms, ["imperil", "jeopardize", "threaten", "menace", "expose", "peril"]);
});
