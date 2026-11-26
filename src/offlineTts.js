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
let activeAudio = null;
let playbackToken = 0;
let activeUtterance = null;
let startTimer = null;

function notifySpeechError(text, accent, rate, error) {
  const message = error === "unsupported"
    ? "当前浏览器不支持朗读，请在 Safari、Chrome 或 Edge 中打开本站。"
    : error === "language-unavailable" || error === "voice-unavailable"
      ? "设备没有可用的英语语音，请在系统语音设置中安装英语语音后重试。"
      : error === "not-allowed"
        ? "浏览器未允许播放语音，请点击“重试发音”，或在系统浏览器中打开本站。"
        : "语音未能开始播放。请检查设备音量和系统英语语音设置，再点击重试；内置浏览器可改用系统浏览器。";
  window.dispatchEvent(new CustomEvent("reader-speech-error", { detail: { text, accent, rate, message, error } }));
}

function stopSpeech(synthesis) {
  if (startTimer) window.clearTimeout(startTimer);
  startTimer = null;
  activeUtterance = null;
  if (synthesis.speaking || synthesis.pending) synthesis.cancel();
}

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
  if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance !== "function") return null;
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
  if (synthesis) stopSpeech(synthesis);
  return playbackToken;
}

function playBrowserSpeech(text, accent, rate = SPEECH_RATE) {
  const synthesis = speechSynthesisApi();
  if (!synthesis) { notifySpeechError(text, accent, rate, "unsupported"); return; }

  refreshVoices();
  if (synthesis.paused) synthesis.resume();

  const spokenText = String(text || "").replace(/-\s+/g, "-").trim();
  if (!spokenText) return;

  const utterance = new SpeechSynthesisUtterance(spokenText);
  utterance.lang = accent === "uk" ? "en-GB" : "en-US";
  utterance.rate = speechRate(rate);
  utterance.pitch = 1;

  const voice = voiceFor(accent);
  if (voice) utterance.voice = voice;
  // Keep the utterance alive until playback completes, including on mobile.
  activeUtterance = utterance;
  utterance.onstart = () => {
    if (activeUtterance !== utterance) return;
    window.clearTimeout(startTimer);
    startTimer = null;
    window.dispatchEvent(new CustomEvent("reader-speech-start"));
  };
  utterance.onend = () => {
    if (activeUtterance !== utterance) return;
    window.clearTimeout(startTimer);
    startTimer = null;
    activeUtterance = null;
  };
  utterance.onerror = (event) => {
    if (activeUtterance !== utterance) return;
    window.clearTimeout(startTimer);
    startTimer = null;
    activeUtterance = null;
    if (!["canceled", "interrupted"].includes(event.error)) notifySpeechError(spokenText, accent, rate, event.error);
  };
  startTimer = window.setTimeout(() => {
    if (activeUtterance === utterance) notifySpeechError(spokenText, accent, rate, "timeout");
  }, 8000);
  try { synthesis.speak(utterance); }
  catch { utterance.onerror({ error: "synthesis-failed" }); }
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
  audio.onplaying = () => {
    if (token === playbackToken) window.dispatchEvent(new CustomEvent("reader-speech-start"));
  };
  const playPromise = audio.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch((error) => {
      if (error?.name === "AbortError" && token !== playbackToken) return;
      fallback();
    });
  }
}

export function warmSpeechEngine() {
  // Load voice metadata without queueing a silent utterance ahead of a tap.
  refreshVoices();
}

export function speakWord(text, accent = "us", options = {}) {
  const word = String(text || "").trim();
  if (!word || typeof window === "undefined") return;

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
  if (!sentence || typeof window === "undefined") return;

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

}
