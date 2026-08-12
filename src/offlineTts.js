const SPEECH_RATE = 1.05;
const NAVIGATION_SPEECH_DELAY = 90;
let cachedVoices = [];
const selectedVoices = new Map();
let pendingSpeechTimer = null;
let speechEngineWarmed = false;

function refreshVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length) {
    cachedVoices = voices;
    selectedVoices.clear();
  }
}

function voiceFor(accent) {
  if (selectedVoices.has(accent)) return selectedVoices.get(accent);

  const language = accent === "uk" ? "en-GB" : "en-US";
  const sameLanguage = (voice) => voice.lang.toLowerCase() === language.toLowerCase();
  const sameFamily = (voice) => voice.lang.toLowerCase().startsWith("en-");

  const voice = (
    cachedVoices.find((voice) => sameLanguage(voice) && voice.localService) ||
    cachedVoices.find(sameLanguage) ||
    cachedVoices.find((voice) => sameFamily(voice) && voice.localService) ||
    cachedVoices.find(sameFamily) ||
    null
  );
  selectedVoices.set(accent, voice);
  return voice;
}

function speechSynthesisApi() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis;
}

function playWord(word, accent) {
  const synthesis = speechSynthesisApi();
  if (!synthesis) return;

  if (cachedVoices.length === 0) refreshVoices();
  synthesis.cancel();
  if (synthesis.paused) synthesis.resume();

  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = accent === "uk" ? "en-GB" : "en-US";
  utterance.rate = SPEECH_RATE;
  utterance.pitch = 1;

  const voice = voiceFor(accent);
  if (voice) utterance.voice = voice;

  synthesis.speak(utterance);
}

export function warmSpeechEngine() {
  const synthesis = speechSynthesisApi();
  if (!synthesis || speechEngineWarmed) return;

  speechEngineWarmed = true;
  refreshVoices();
  const primer = new SpeechSynthesisUtterance("ready");
  primer.lang = "en-US";
  primer.volume = 0;
  primer.rate = SPEECH_RATE;
  const voice = voiceFor("us");
  if (voice) primer.voice = voice;
  synthesis.speak(primer);
}

export function speakWord(text, accent = "us", options = {}) {
  const word = String(text || "").trim();
  const synthesis = speechSynthesisApi();
  if (!word || !synthesis) return;

  if (pendingSpeechTimer) {
    window.clearTimeout(pendingSpeechTimer);
    pendingSpeechTimer = null;
  }

  synthesis.cancel();
  const delay = Math.max(0, Number(options.delay) || 0);
  if (delay > 0) {
    pendingSpeechTimer = window.setTimeout(() => {
      pendingSpeechTimer = null;
      playWord(word, accent);
    }, delay);
    return;
  }

  playWord(word, accent);
}

export function speakNavigationWord(text, accent = "us") {
  speakWord(text, accent, { delay: NAVIGATION_SPEECH_DELAY });
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  refreshVoices();
  window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);

  const warmOnce = () => {
    window.removeEventListener("pointerdown", warmOnce, true);
    window.removeEventListener("keydown", warmOnce, true);
    warmSpeechEngine();
  };
  window.addEventListener("pointerdown", warmOnce, { capture: true, once: true });
  window.addEventListener("keydown", warmOnce, { capture: true, once: true });
}
