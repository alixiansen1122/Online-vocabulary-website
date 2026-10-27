import test from "node:test";
import assert from "node:assert/strict";

test("tap playback has no silent primer or idle cancellation; replacing speech cancels once and ignores stale failures", async () => {
  const events = [], utterances = [];
  let cancels = 0;
  const win = new EventTarget();
  const engine = { speaking: false, pending: false, paused: false, getVoices: () => [], addEventListener() {}, cancel() { cancels++; }, speak(value) { utterances.push(value); }, resume() {} };
  win.speechSynthesis = engine;
  win.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  win.setTimeout = () => 1;
  win.clearTimeout = () => {};
  win.addEventListener("reader-speech-error", (event) => events.push(event.detail));
  globalThis.window = win;
  globalThis.SpeechSynthesisUtterance = win.SpeechSynthesisUtterance;
  try {
    const { speakWord, warmSpeechEngine } = await import("./offlineTts.js?test");
    warmSpeechEngine();
    assert.equal(utterances.length, 0);
    speakWord("atmosphere", "uk");
    assert.equal(cancels, 0);
    assert.equal(utterances.length, 1);
    assert.equal(utterances[0].lang, "en-GB");
    engine.speaking = true;
    speakWord("oxygen", "us");
    assert.equal(cancels, 1);
    utterances[0].onerror({ error: "interrupted" });
    assert.equal(events.length, 0);
    utterances[1].onerror({ error: "not-allowed" });
    assert.equal(events[0].text, "oxygen");
    assert.match(events[0].message, /重试/);
    delete win.speechSynthesis;
    speakWord("oxide");
    assert.equal(events.at(-1).error, "unsupported");
  } finally {
    delete globalThis.window;
    delete globalThis.SpeechSynthesisUtterance;
  }
});
