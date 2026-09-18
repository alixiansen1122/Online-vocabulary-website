import { useState } from "react";
import { ArrowLeft, Volume2 } from "lucide-react";
import SpellingPractice from "./SpellingPractice";
import { needsSpellingReview } from "./spellingRecords";
import { speakWord } from "./offlineTts";

const buttonClass = "rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40";

export default function SpellingReviewPage({ book, records, accent, separated, getPattern, onAttempt, onBack }) {
  const [round, setRound] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const history = book.words.filter((word) => records[word.id]?.errors > 0);
  const pending = history.filter((word) => needsSpellingReview(records[word.id]));
  const currentWord = round && !round.finished ? round.words[round.index] : null;
  const first = round?.results.filter((item) => item.outcome === "first").length || 0;
  const retry = round?.results.filter((item) => item.outcome === "retry").length || 0;
  const remaining = round ? round.words.filter((word) => !round.results.some((item) => item.id === word.id && item.outcome === "first")) : [];

  function start(words) {
    if (!words.length) return;
    setRound({ words: [...words], index: 0, results: [], finished: false, id: (round?.id || 0) + 1 });
    setFeedback(null);
    speakWord(words[0].term, accent);
  }

  function advance(finish = false) {
    const outcome = feedback?.correct ? feedback.firstTry ? "first" : "retry" : "pending";
    const results = [...round.results, { id: currentWord.id, outcome }];
    const index = round.index + 1;
    const finished = finish || index >= round.words.length;
    setRound({ ...round, index, results, finished });
    setFeedback(null);
    if (!finished) speakWord(round.words[index].term, accent);
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-10 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4">
          <button type="button" aria-label="返回仪表盘" onClick={onBack} className="rounded-lg p-2 hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></button>
          <h1 className="text-lg font-bold">拼写错词</h1>
          <span className="ml-auto truncate text-sm text-slate-500">{book.title}</span>
        </div>
      </header>
      <section className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        {currentWord ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-8">
            <div className="flex items-center justify-between gap-3 text-sm text-slate-500">
              <span>本轮 {round.index + 1} / {round.words.length}</span>
              <button type="button" onClick={() => advance(true)} className="rounded-md px-3 py-2 hover:bg-slate-100">结束本轮</button>
            </div>
            <div className="mb-7 mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-orange-500" style={{ width: `${round.index / round.words.length * 100}%` }} /></div>
            <p className="text-sm font-semibold text-slate-500">根据释义或读音拼写</p>
            <p className="mt-3 text-xl font-bold leading-relaxed">{currentWord.pos} {currentWord.meaning}</p>
            <button type="button" onClick={() => speakWord(currentWord.term, accent)} className="my-5 inline-flex items-center gap-2 rounded-full bg-orange-50 px-4 py-2 text-sm font-bold text-orange-700"><Volume2 className="h-4 w-4" />播放读音</button>
            <SpellingPractice key={`${round.id}:${currentWord.id}`} word={currentWord} pattern={getPattern(currentWord, separated)} accent={accent} showInput stopAfterCorrect
              onProgress={setFeedback} onAttempt={(id, result) => onAttempt(id, result, true)} />
            {feedback?.complete && <p className="mt-4 text-base text-slate-600">正确拼写：<strong className="font-mono text-orange-600">{currentWord.term}</strong></p>}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={() => advance()} className="rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100">{feedback?.correct ? "继续练习下一词" : "暂时跳过"}</button>
              <button type="button" disabled={!feedback?.complete} onClick={() => advance()} className={buttonClass}>{round.index + 1 === round.words.length ? "完成本轮" : "下一词"}</button>
            </div>
            <p className="mt-5 text-sm leading-6 text-slate-500">首次答对才移出待复习；重试答对会留到下一轮巩固。已完成的拼写结果会自动保存。</p>
          </div>
        ) : round?.finished ? (
          <div className="rounded-xl border border-orange-100 bg-white p-5 sm:p-8">
            <h2 className="text-2xl font-bold">本轮练习结束</h2>
            <p className="mt-2 text-sm text-slate-500">完成 {round.results.length} / {round.words.length} 词；未完成的词仍保留在待复习中。</p>
            <div className="my-6 grid grid-cols-3 gap-2">
              {[[first, "首次答对"], [retry, "重试答对"], [remaining.length, "仍需复习"]].map(([count, label]) => <div key={label} className="rounded-lg bg-slate-50 p-3 text-center"><strong className="block text-2xl text-orange-600">{count}</strong><span className="mt-1 block text-sm text-slate-600">{label}</span></div>)}
            </div>
            <p className="mb-5 text-sm text-slate-500">仍需复习包含重试答对、未答对和跳过的词。</p>
            <div className="flex flex-wrap gap-3">
              {remaining.length > 0 && <button type="button" className={buttonClass} onClick={() => start(remaining)}>集中重练这 {remaining.length} 词</button>}
              <button type="button" className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-bold" onClick={() => setRound(null)}>返回错词记录</button>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-orange-100 bg-white p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div><h2 className="text-2xl font-bold">{pending.length} 词待复习</h2><p className="mt-2 text-sm text-slate-500">首次答对移出待复习，历史错词记录继续保留。</p></div>
                <button type="button" className={buttonClass} disabled={!pending.length} onClick={() => start(pending)}>开始集中重练</button>
              </div>
            </div>
            {history.length ? <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <h2 className="border-b border-slate-100 px-5 py-4 text-base font-bold">错词记录 · {history.length} 词</h2>
              <ul className="divide-y divide-slate-100">{[...history].sort((a, b) => Number(needsSpellingReview(records[b.id])) - Number(needsSpellingReview(records[a.id])) || records[b.id].lastWrongAt - records[a.id].lastWrongAt).map((word) => {
                const record = records[word.id];
                return <li key={word.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-lg">{word.term}</strong><span className={`rounded-full px-2.5 py-1 text-sm ${needsSpellingReview(record) ? "bg-orange-50 text-orange-700" : "bg-slate-100 text-slate-500"}`}>{needsSpellingReview(record) ? "待复习" : "已通过重练"}</span></div>
                  <p className="mt-1 text-sm text-slate-600">{word.pos} {word.meaning}</p>
                  <p className="mt-2 break-all text-sm text-slate-500">最近错拼：<span className="font-mono text-red-600">{record.lastWrongInput}</span></p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">错拼 {record.errors} 次 · 首次答对 {record.firstTryCorrect} 次 · 重试答对 {record.retryCorrect} 次</p>
                </li>;
              })}</ul>
            </div> : <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center"><h2 className="text-lg font-bold">还没有拼写错词</h2><p className="mt-2 text-sm text-slate-500">在单词详情中完成一次拼写，拼错的词会自动收集到这里。</p><button type="button" onClick={onBack} className="mt-5 rounded-lg bg-white px-4 py-2.5 text-sm font-bold">返回仪表盘</button></div>}
          </>
        )}
      </section>
    </main>
  );
}
