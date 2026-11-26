const SPEECH_RATE = 1.05;
const NAVIGATION_SPEECH_DELAY = 90;
const PREFERRED_FEMALE_VOICE_KEYWORDS = [
  "emma",
  "ava",
  "jenny",
  "aria",
  "libby",
  "sonia",
  "samantha",
  "victoria",
  "karen",
  "zira",
  "hazel",
  "susan",
  "female",
];

let cachedVoices = [];
const selectedVoices = new Map();
const missingAudioKeys = new Set();
let pendingSpeechTimer = null;
let speechEngineWarmed = false;
let activeAudio = null;
let playbackToken = 0;

export function audioFileName(term) {
  const slug = String(term || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${slug || "word"}.mp3`;
}

function refreshVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length) {
    cachedVoices = voices;
    selectedVoices.clear();
  }
}

function isPreferredFemaleVoice(voice) {
  const name = String(voice?.name || "").toLowerCase();
  return PREFERRED_FEMALE_VOICE_KEYWORDS.some((keyword) => name.includes(keyword));
}

function voiceFor(accent) {
  if (selectedVoices.has(accent)) return selectedVoices.get(accent);

  const language = accent === "uk" ? "en-GB" : "en-US";
  const sameLanguage = (voice) => voice.lang.toLowerCase() === language.toLowerCase();
  const sameFamily = (voice) => voice.lang.toLowerCase().startsWith("en-");

  const voice = (
    cachedVoices.find((item) => sameLanguage(item) && isPreferredFemaleVoice(item) && item.localService) ||
    cachedVoices.find((item) => sameLanguage(item) && isPreferredFemaleVoice(item)) ||
    cachedVoices.find((item) => sameLanguage(item) && item.localService) ||
    cachedVoices.find(sameLanguage) ||
    cachedVoices.find((item) => sameFamily(item) && isPreferredFemaleVoice(item) && item.localService) ||
    cachedVoices.find((item) => sameFamily(item) && isPreferredFemaleVoice(item)) ||
    cachedVoices.find((item) => sameFamily(item) && item.localService) ||
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

function speechRate(value) {
  const rate = Number(value);
  return Number.isFinite(rate) ? Math.min(2, Math.max(0.5, rate)) : SPEECH_RATE;
}

function stopCurrentPlayback() {
  playbackToken += 1;
  if (pendingSpeechTimer) {
    window.clearTimeout(pendingSpeechTimer);
    pendingSpeechTimer = null;
  }
  if (activeAudio) {
    activeAudio.onerror = null;
    try {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    } catch {
      // Ignore audio reset errors on detached media elements.
    }
  }
  const synthesis = speechSynthesisApi();
  if (synthesis) synthesis.cancel();
  return playbackToken;
}

function playBrowserSpeech(text, accent, rate = SPEECH_RATE) {
  const synthesis = speechSynthesisApi();
  if (!synthesis) return;

  if (cachedVoices.length === 0) refreshVoices();
  synthesis.cancel();
  if (synthesis.paused) synthesis.resume();

  const spokenText = String(text || "").replace(/-\s+/g, "-").trim();
  if (!spokenText) return;

  const utterance = new SpeechSynthesisUtterance(spokenText);
  utterance.lang = accent === "uk" ? "en-GB" : "en-US";
  utterance.rate = speechRate(rate);
  utterance.pitch = 1;

  const voice = voiceFor(accent);
  if (voice) utterance.voice = voice;

  synthesis.speak(utterance);
}

function playWordAudioOrFallback(word, accent, rate, token) {
  if (token !== playbackToken) return;
  const normalizedAccent = accent === "uk" ? "uk" : "us";
  const fileName = audioFileName(word);
  const cacheKey = `${normalizedAccent}:${fileName}`;

  if (typeof window === "undefined" || typeof Audio === "undefined" || missingAudioKeys.has(cacheKey)) {
    playBrowserSpeech(word, normalizedAccent, rate);
    return;
  }

  const audio = activeAudio || new Audio();
  activeAudio = audio;
  audio.preload = "auto";
  audio.src = `/audio/${normalizedAccent}/${fileName}`;
  audio.playbackRate = Number.isFinite(Number(rate)) ? Math.min(2, Math.max(0.5, Number(rate))) : 1;

  let fallbackTriggered = false;
  const fallback = () => {
    if (fallbackTriggered || token !== playbackToken) return;
    fallbackTriggered = true;
    missingAudioKeys.add(cacheKey);
    playBrowserSpeech(word, normalizedAccent, rate);
  };

  audio.onerror = fallback;
  const playPromise = audio.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch((error) => {
      if (error?.name === "AbortError" && token !== playbackToken) return;
      fallback();
    });
  }
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
  if (!word) return;

  const token = stopCurrentPlayback();
  const delay = Math.max(0, Number(options.delay) || 0);
  const rate = Number.isFinite(Number(options.rate)) ? speechRate(options.rate) : 1;

  if (delay > 0) {
    pendingSpeechTimer = window.setTimeout(() => {
      pendingSpeechTimer = null;
      playWordAudioOrFallback(word, accent, rate, token);
    }, delay);
    return;
  }

  playWordAudioOrFallback(word, accent, rate, token);
}

export function speakNavigationWord(text, accent = "us") {
  speakWord(text, accent, { delay: NAVIGATION_SPEECH_DELAY });
}

export function speakSentence(text, accent = "us", options = {}) {
  const sentence = String(text || "").trim();
  if (!sentence) return;

  const token = stopCurrentPlayback();
  const delay = Math.max(0, Number(options.delay) || 0);
  const rate = speechRate(options.rate);

  if (delay > 0) {
    pendingSpeechTimer = window.setTimeout(() => {
      pendingSpeechTimer = null;
      if (token === playbackToken) playBrowserSpeech(sentence, accent, rate);
    }, delay);
    return;
  }

  playBrowserSpeech(sentence, accent, rate);
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
