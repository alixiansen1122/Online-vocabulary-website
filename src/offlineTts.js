const SPEECH_RATE = 1.05;
const NAVIGATION_SPEECH_DELAY = 90;
let cachedVoices = [];
const selectedVoices = new Map();
let pendingSpeechTimer = null;
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
  if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance !== "function") return null;
  return window.speechSynthesis;
}

function speechRate(value) {
  const rate = Number(value);
  return Number.isFinite(rate) ? Math.min(2, Math.max(0.5, rate)) : SPEECH_RATE;
}

function playWord(word, accent, rate = SPEECH_RATE) {
  const synthesis = speechSynthesisApi();
  if (!synthesis) return;

  refreshVoices();
  if (synthesis.paused) synthesis.resume();

  const utterance = new SpeechSynthesisUtterance(word);
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
    if (!["canceled", "interrupted"].includes(event.error)) notifySpeechError(word, accent, rate, event.error);
  };
  startTimer = window.setTimeout(() => {
    if (activeUtterance === utterance) notifySpeechError(word, accent, rate, "timeout");
  }, 8000);
  try { synthesis.speak(utterance); }
  catch { utterance.onerror({ error: "synthesis-failed" }); }
}

export function warmSpeechEngine() {
  // Load voice metadata without queueing a silent utterance ahead of a tap.
  refreshVoices();
}

export function speakWord(text, accent = "us", options = {}) {
  const word = String(text || "").trim();
  const synthesis = speechSynthesisApi();
  if (!word || typeof window === "undefined") return;
  if (!synthesis) { notifySpeechError(word, accent, speechRate(options.rate), "unsupported"); return; }

  if (pendingSpeechTimer) {
    window.clearTimeout(pendingSpeechTimer);
    pendingSpeechTimer = null;
  }

  stopSpeech(synthesis);
  const delay = Math.max(0, Number(options.delay) || 0);
  const rate = speechRate(options.rate);
  if (delay > 0) {
    pendingSpeechTimer = window.setTimeout(() => {
      pendingSpeechTimer = null;
      playWord(word, accent, rate);
    }, delay);
    return;
  }

  playWord(word, accent, rate);
}

export function speakNavigationWord(text, accent = "us") {
  speakWord(text, accent, { delay: NAVIGATION_SPEECH_DELAY });
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  refreshVoices();
  window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);

}
