import { useEffect, useState } from "react";
import { speakWord } from "./offlineTts";

export default function SpeechFeedback() {
  const [failure, setFailure] = useState(null);
  useEffect(() => {
    const fail = (event) => setFailure(event.detail);
    const started = () => setFailure(null);
    window.addEventListener("reader-speech-error", fail);
    window.addEventListener("reader-speech-start", started);
    return () => { window.removeEventListener("reader-speech-error", fail); window.removeEventListener("reader-speech-start", started); };
  }, []);
  if (!failure) return null;
  return <div role="status" className="fixed inset-x-3 top-3 z-[110] mx-auto max-w-lg rounded-xl border border-orange-200 bg-white p-4 shadow-xl" style={{ marginTop: "env(safe-area-inset-top)" }}>
    <p className="text-sm leading-6 text-slate-800">{failure.message}</p>
    <div className="mt-2 flex gap-2"><button type="button" className="min-h-11 rounded-lg bg-orange-600 px-4 text-sm font-bold text-white" onClick={() => speakWord(failure.text, failure.accent, { rate: failure.rate })}>重试发音</button><button type="button" className="min-h-11 rounded-lg px-4 text-sm" onClick={() => setFailure(null)}>关闭提示</button></div>
  </div>;
}
