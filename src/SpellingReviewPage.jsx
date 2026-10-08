import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, History, Volume2 } from "lucide-react";
import SpellingPractice from "./SpellingPractice";
import { hasScheduledSpellingReview, needsSpellingReview } from "./spellingRecords";
import { speakWord } from "./offlineTts";

const buttonClass = "rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40";
const DAY_MS = 24 * 60 * 60 * 1000;

function reviewPriority(record) {
  const attempts = Math.max(1, Number(record?.attempts || 0));
  const errorRate = Number(record?.errors || 0) / attempts;
  return errorRate * 10000000000000 + Number(record?.lastWrongAt || 0);
}

function reviewStatus(record, now) {
  if (needsSpellingReview(record, now)) return { label: "今日复习", tone: "bg-orange-50 text-orange-700" };
  if (!record?.nextReviewAt) return { label: "错词记录", tone: "bg-slate-100 text-slate-500" };
  const days = Math.max(1, Math.ceil((record.nextReviewAt - now) / DAY_MS));
  return { label: days === 1 ? "明天复习" : `${days} 天后复习`, tone: "bg-emerald-50 text-emerald-700" };
}

export default function SpellingReviewPage({ book, records, accent, separated, getPattern, onAttempt, onBack, initialScope = "due" }) {
  const [scope, setScope] = useState(initialScope);
  const [round, setRound] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [now] = useState(() => Date.now());
  const history = useMemo(() => book.words.filter((word) => records[word.id]?.errors > 0), [book.words, records]);
  const planned = useMemo(() => book.words.filter((word) => {
    const record = records[word.id];
    return record && (record.errors > 0 || hasScheduledSpellingReview(record));
  }), [book.words, records]);
  const pending = useMemo(() => planned
    .filter((word) => needsSpellingReview(records[word.id], now))
    .sort((a, b) => reviewPriority(records[b.id]) - reviewPriority(records[a.id])), [now, planned, records]);
  const mistakes = useMemo(() => [...history]
    .sort((a, b) => reviewPriority(records[b.id]) - reviewPriority(records[a.id])), [history, records]);
  const selectedWords = scope === "mistakes" ? mistakes : pending;
  const currentWord = round && !round.finished ? round.words[round.index] : null;
  const first = round?.results.filter((item) => item.outcome === "first").length || 0;
  const retry = round?.results.filter((item) => item.outcome === "retry").length || 0;
  const passedIds = new Set(round?.results.filter((item) => item.outcome === "first").map((item) => item.id) || []);
  const remaining = round ? Array.from(new Map(round.words.filter((word) => !passedIds.has(word.id)).map((word) => [word.id, word])).values()) : [];

  function start(words = selectedWords) {
    if (!words.length) return;
    setRound({ words: [...words], index: 0, results: [], finished: false, id: (round?.id || 0) + 1 });
    setFeedback(null);
    speakWord(words[0].term, accent);
  }

  const advance = useCallback((finish = false) => {
    if (!round || !currentWord) return;
    const outcome = feedback?.correct ? feedback.firstTry ? "first" : "retry" : "pending";
    const results = [...round.results, { id: currentWord.id, outcome }];
    const words = [...round.words];
    if (!finish && outcome !== "first") {
      const repeatAt = Math.min(words.length, round.index + 4);
      words.splice(repeatAt, 0, currentWord);
    }
    const index = round.index + 1;
    const finished = finish || index >= words.length;
    setRound({ ...round, words, index, results, finished });
    setFeedback(null);
    if (!finished) speakWord(words[index].term, accent);
  }, [accent, currentWord, feedback, round]);

  useEffect(() => {
    if (!currentWord || !feedback?.correct) return undefined;
    const timer = window.setTimeout(() => advance(), 900);
    return () => window.clearTimeout(timer);
  }, [advance, currentWord, feedback?.correct]);

  return (
    <main className="min-h-screen bg-slate-50 pb-10 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4">
          <button type="button" aria-label="返回仪表盘" onClick={onBack} className="rounded-lg p-2 hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></button>
          <h1 className="text-lg font-bold">智能拼写复习</h1>
          <span className="ml-auto truncate text-sm text-slate-500">{book.title}</span>
        </div>
      </header>
      <section className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        {currentWord ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-8">
            <div className="flex items-center justify-between gap-3 text-sm text-slate-500">
              <span>本轮第 {round.index + 1} 次 · 队列剩余 {round.words.length - round.index} 次</span>
              <button type="button" onClick={() => advance(true)} className="rounded-md px-3 py-2 hover:bg-slate-100">结束本轮</button>
            </div>
            <div className="mb-7 mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-orange-500 transition-all" style={{ width: `${round.index / round.words.length * 100}%` }} /></div>
            <p className="text-sm font-semibold text-slate-500">根据释义或读音拼写</p>
            <p className="mt-3 text-xl font-bold leading-relaxed">{currentWord.pos} {currentWord.meaning}</p>
            <button type="button" onClick={() => speakWord(currentWord.term, accent)} className="my-5 inline-flex items-center gap-2 rounded-full bg-orange-50 px-4 py-2 text-sm font-bold text-orange-700"><Volume2 className="h-4 w-4" />播放读音</button>
            <SpellingPractice key={`${round.id}:${round.index}:${currentWord.id}`} word={currentWord} pattern={getPattern(currentWord, separated)} accent={accent} showInput stopAfterCorrect
              record={records[currentWord.id]} onProgress={setFeedback} onAttempt={(id, result) => onAttempt(id, result, true)} />
            {feedback?.complete && <p className="mt-4 text-base text-slate-600">正确拼写：<strong className="font-mono text-orange-600">{currentWord.term}</strong></p>}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={() => advance()} className="rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100">{feedback?.correct ? "立即下一词" : "暂时跳过"}</button>
              <button type="button" disabled={!feedback?.complete} onClick={() => advance()} className={buttonClass}>{feedback?.correct ? "即将自动进入下一词" : "下一词"}</button>
            </div>
            <p className="mt-5 text-sm leading-6 text-slate-500">未首次答对的词会自动插回队列，间隔几个词后再次出现；首次答对后按 1、3、7、14、30 天安排下次复习。</p>
          </div>
        ) : round?.finished ? (
          <div className="rounded-xl border border-orange-100 bg-white p-5 sm:p-8">
            <h2 className="text-2xl font-bold">本轮练习结束</h2>
            <p className="mt-2 text-sm text-slate-500">共完成 {round.results.length} 次拼写；没有首次答对的词仍会保留在复习队列中。</p>
            <div className="my-6 grid grid-cols-3 gap-2">
              {[[first, "首次答对"], [retry, "重试答对"], [remaining.length, "仍需复习"]].map(([count, label]) => <div key={label} className="rounded-lg bg-slate-50 p-3 text-center"><strong className="block text-2xl text-orange-600">{count}</strong><span className="mt-1 block text-sm text-slate-600">{label}</span></div>)}
            </div>
            <div className="flex flex-wrap gap-3">
              {remaining.length > 0 && <button type="button" className={buttonClass} onClick={() => start(remaining)}>继续巩固这 {remaining.length} 词</button>}
              <button type="button" className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-bold" onClick={() => setRound(null)}>查看复习计划</button>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-orange-100 bg-white p-5 sm:p-7">
              <div className="mb-5 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
                <button type="button" onClick={() => setScope("due")} className={`flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-bold transition ${scope === "due" ? "bg-white text-orange-600 shadow-sm" : "text-slate-500"}`}><CalendarDays className="h-4 w-4" />今日复习</button>
                <button type="button" onClick={() => setScope("mistakes")} className={`flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-bold transition ${scope === "mistakes" ? "bg-white text-orange-600 shadow-sm" : "text-slate-500"}`}><History className="h-4 w-4" />只练错词</button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">{selectedWords.length} 词{scope === "due" ? "今日到期" : "曾经拼错"}</h2>
                  <p className="mt-2 text-sm text-slate-500">已建立复习计划 {planned.length} 词 · 今日待复习 {pending.length} 词</p>
                </div>
                <button type="button" className={buttonClass} disabled={!selectedWords.length} onClick={() => start()}>{scope === "due" ? "开始今日复习" : "开始错词重练"}</button>
              </div>
            </div>
            {planned.length ? <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <h2 className="border-b border-slate-100 px-5 py-4 text-base font-bold">复习计划 · {planned.length} 词</h2>
              <ul className="divide-y divide-slate-100">{[...planned].sort((a, b) => {
                const aDue = Number(needsSpellingReview(records[a.id], now));
                const bDue = Number(needsSpellingReview(records[b.id], now));
                return bDue - aDue || Number(records[a.id].nextReviewAt || Infinity) - Number(records[b.id].nextReviewAt || Infinity);
              }).map((word) => {
                const record = records[word.id];
                const status = reviewStatus(record, now);
                return <li key={word.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-lg">{word.term}</strong><span className={`rounded-full px-2.5 py-1 text-sm font-semibold ${status.tone}`}>{status.label}</span></div>
                  <p className="mt-1 text-sm text-slate-600">{word.pos} {word.meaning}</p>
                  {record.lastWrongInput && <p className="mt-2 break-all text-sm text-slate-500">最近错拼：<span className="font-mono text-red-600">{record.lastWrongInput}</span></p>}
                  <p className="mt-2 text-sm leading-6 text-slate-500">阶段 {record.reviewStage || 0}/5 · 错拼 {record.errors} 次 · 首次答对 {record.firstTryCorrect} 次 · 重试答对 {record.retryCorrect} 次</p>
                </li>;
              })}</ul>
            </div> : <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center"><h2 className="text-lg font-bold">还没有复习计划</h2><p className="mt-2 text-sm text-slate-500">在单词详情中完成一次拼写后，系统会自动安排后续复习。</p><button type="button" onClick={onBack} className="mt-5 rounded-lg bg-white px-4 py-2.5 text-sm font-bold">返回仪表盘</button></div>}
          </>
        )}
      </section>
    </main>
  );
}
