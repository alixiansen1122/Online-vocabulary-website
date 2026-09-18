import { useCallback, useEffect, useRef, useState } from "react";
import { speakWord } from "./offlineTts";
import { spellingFeedback } from "./spellingRecords";

export default function SpellingPractice({ word, pattern, accent, keyboardMode = "desktop", enabled = true, onAttempt, onProgress, showInput = false, stopAfterCorrect = false }) {
  const [attempt, setAttempt] = useState({ input: "", completedAttempts: 0, result: null });
  const attemptRef = useRef(attempt);
  const inputRef = useRef(null);
  const typed = attempt.input;
  const result = attempt.result;
  const completed = Boolean(result?.complete);
  const correct = Boolean(result?.correct);
  const wrong = completed && !correct;

  const updateInput = useCallback((input, restart = false) => {
    const previous = attemptRef.current;
    if (stopAfterCorrect && previous.result?.correct) return;
    const value = input.replace(/[^a-z]/gi, "").slice(0, pattern.target.length);
    if (value === previous.input && !restart) return;
    const feedback = spellingFeedback(value, pattern.target, previous.completedAttempts > 0);
    const next = { input: value, completedAttempts: previous.completedAttempts + Number(feedback.complete), result: feedback };
    attemptRef.current = next;
    setAttempt(next);
    onProgress?.(feedback);
    if (feedback.complete) {
      onAttempt?.(word.id, feedback);
      if (feedback.correct) speakWord(word.term, accent);
    }
  }, [accent, onAttempt, onProgress, pattern.target, stopAfterCorrect, word.id, word.term]);

  useEffect(() => {
    if (!enabled || showInput || !pattern.target) return undefined;
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const handleKeyDown = (event) => {
      const modeMatches = keyboardMode === "desktop" ? desktopQuery.matches : !desktopQuery.matches;
      if (!modeMatches || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.repeat) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      const current = attemptRef.current;
      if (event.key === "Backspace") {
        if (current.input) { event.preventDefault(); updateInput(current.input.slice(0, -1)); }
      } else if (/^[a-z]$/i.test(event.key)) {
        event.preventDefault();
        updateInput(`${current.result?.complete ? "" : current.input}${event.key}`, current.result?.complete);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, keyboardMode, pattern.target, showInput, updateInput]);

  const status = correct
    ? `${result.firstTry ? "首次答对" : "重试答对"}，${stopAfterCorrect ? "可以继续下一词" : "再输入即可重练"}`
    : wrong ? "拼写错误，红色标出错字；已加入错词记录"
      : typed ? `${typed.length}/${pattern.target.length}` : "输入完整单词后自动检查";
  const hasInput = showInput || keyboardMode === "mobile";

  return (
    <div className="max-w-full rounded-lg bg-slate-50 px-3 py-3 sm:px-4" aria-label="键盘拼写练习">
      <div className="flex max-w-full flex-wrap items-end justify-end gap-x-1.5 gap-y-2 font-mono text-base font-bold sm:text-lg">
        {pattern.groups.map((group, groupIndex) => group.type === "separator" ? (
          <span key={`separator-${groupIndex}`} className="pb-1 text-slate-300">{group.text}</span>
        ) : (
          <span key={`letters-${groupIndex}`} className="inline-flex items-end gap-1">
            {group.slots.map((slot) => {
              const incorrect = wrong && result.wrongIndices.includes(slot.index);
              const tone = incorrect ? "border-red-500 bg-red-100 text-red-600" : completed ? "border-orange-500 text-orange-600" : "border-slate-300 text-slate-800";
              return <span key={slot.index} aria-label={incorrect ? `第 ${slot.index + 1} 个字母错误` : undefined} className={`inline-flex h-7 w-4 items-end justify-center border-b-2 pb-0.5 ${tone}`}>{typed[slot.index] || "\u00a0"}</span>;
            })}
          </span>
        ))}
      </div>
      {hasInput && <input ref={inputRef} type="text" value={typed} disabled={!enabled || (stopAfterCorrect && correct)} aria-label="输入单词拼写" placeholder="在这里输入英文" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
        onFocus={() => { if (completed) inputRef.current?.select(); }}
        onChange={(event) => {
          const value = event.target.value;
          const restart = completed && value.startsWith(typed) && value.length > typed.length;
          updateInput(restart ? value.slice(typed.length) : value, restart);
        }}
        className="mt-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-orange-500" />}
      <p aria-live="polite" className={`mt-2 text-right text-sm font-semibold ${correct ? "text-orange-600" : wrong ? "text-red-600" : "text-slate-500"}`}>{status}</p>
    </div>
  );
}
