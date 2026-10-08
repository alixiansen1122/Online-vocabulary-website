import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, BookOpen, CalendarDays, ChevronLeft, ChevronRight, LoaderCircle, RotateCcw, SpellCheck2 } from "lucide-react";
import { needsSpellingReview } from "./spellingRecords";
import { chinaDateKey, summarizeDays } from "./studyStats";

const MONTH_NAMES = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
const WEEK_NAMES = ["一", "二", "三", "四", "五", "六", "日"];
const EMPTY_TOTALS = { activeDays: 0, wordViews: 0, spellingAttempts: 0, correct: 0, wrong: 0, firstTryCorrect: 0, retryCorrect: 0, reviewAttempts: 0, reviewCorrect: 0 };

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateKey(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function monthCells(year, month) {
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return [...Array(firstWeekday).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];
}

function activityTone(total) {
  if (total >= 30) return "bg-orange-600 text-white border-orange-600";
  if (total >= 15) return "bg-orange-400 text-white border-orange-400";
  if (total >= 6) return "bg-orange-200 text-orange-950 border-orange-200";
  if (total >= 1) return "bg-orange-50 text-orange-800 border-orange-100";
  return "bg-white text-slate-400 border-slate-100";
}

function percentage(part, total) {
  return total > 0 ? `${Math.round((part / total) * 100)}%` : "—";
}

function StatCard({ value, label, hint, icon: Icon }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <strong className="block text-2xl font-extrabold tabular-nums text-slate-950 sm:text-3xl">{value}</strong>
          <span className="mt-1 block text-sm font-bold text-slate-600">{label}</span>
          {hint && <span className="mt-1 block text-xs font-semibold text-slate-400">{hint}</span>}
        </div>
        {Icon && <span className="rounded-lg bg-orange-50 p-2 text-orange-600"><Icon className="h-5 w-5" /></span>}
      </div>
    </div>
  );
}

function MonthCalendar({ year, month, dayByDate, selectedDate, onSelectDate }) {
  const cells = monthCells(year, month);
  const monthDays = [...dayByDate.values()].filter((item) => item.date.startsWith(`${year}-${pad(month + 1)}-`));
  const totals = summarizeDays(monthDays);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="font-extrabold text-slate-900">{MONTH_NAMES[month]}</h3>
        <span className="text-xs font-semibold text-slate-400">{totals.activeDays} 天 · {totals.wordViews} 词</span>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEK_NAMES.map((name) => <span key={name} className="pb-1 text-[10px] font-bold text-slate-300">{name}</span>)}
        {cells.map((day, index) => {
          if (!day) return <span key={`empty-${index}`} className="aspect-square" />;
          const key = dateKey(year, month, day);
          const stats = dayByDate.get(key);
          const total = Number(stats?.wordViews || 0) + Number(stats?.spellingAttempts || 0);
          const selected = selectedDate === key;
          return (
            <button
              type="button"
              key={key}
              onClick={() => onSelectDate(key)}
              title={`${key} · 学习 ${stats?.wordViews || 0} 词 · 拼写 ${stats?.spellingAttempts || 0} 次`}
              aria-label={`${key}，学习 ${stats?.wordViews || 0} 词，拼写 ${stats?.spellingAttempts || 0} 次`}
              className={`aspect-square rounded-md border text-[10px] font-bold tabular-nums transition hover:-translate-y-0.5 hover:shadow-sm sm:text-xs ${activityTone(total)} ${selected ? "ring-2 ring-slate-900 ring-offset-1" : ""}`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function StudyStatsPage({ viewed, spellingRecords, wordById, onOpenWord, onBack, statsRevision = 0 }) {
  const currentYear = Number(chinaDateKey().slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(chinaDateKey());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/stats?year=${year}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "学习统计读取失败");
        return result;
      })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        const today = chinaDateKey();
        const fallback = result.days?.at(-1)?.date || `${year}-01-01`;
        setSelectedDate(today.startsWith(`${year}-`) ? today : fallback);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "学习统计读取失败");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [statsRevision, year]);

  const dayByDate = useMemo(() => new Map((data?.days || []).map((day) => [day.date, day])), [data?.days]);
  const selectedDay = dayByDate.get(selectedDate) || { date: selectedDate, ...EMPTY_TOTALS };
  const yearTotals = data?.yearTotals || EMPTY_TOTALS;
  const monthly = useMemo(() => MONTH_NAMES.map((name, month) => ({
    name,
    ...summarizeDays((data?.days || []).filter((day) => day.date.startsWith(`${year}-${pad(month + 1)}-`))),
  })), [data?.days, year]);

  const legacy = useMemo(() => {
    const records = Object.values(spellingRecords || {});
    const attempts = records.reduce((total, record) => total + Number(record.attempts || 0), 0);
    const correct = records.reduce((total, record) => total + Number(record.firstTryCorrect || 0) + Number(record.retryCorrect || 0), 0);
    const firstTry = records.reduce((total, record) => total + Number(record.firstTryCorrect || 0), 0);
    return {
      viewed: Object.keys(viewed || {}).length,
      attempts,
      correct,
      firstTry,
      pending: records.filter(needsSpellingReview).length,
    };
  }, [spellingRecords, viewed]);

  const weakWords = useMemo(() => Object.entries(spellingRecords || {})
    .filter(([, record]) => Number(record.errors || 0) > 0)
    .map(([id, record]) => ({ id, record, word: wordById.get(id) }))
    .filter((item) => item.word)
    .sort((a, b) => Number(needsSpellingReview(b.record)) - Number(needsSpellingReview(a.record)) || b.record.errors - a.record.errors || b.record.lastWrongAt - a.record.lastWrongAt)
    .slice(0, 12), [spellingRecords, wordById]);

  return (
    <main className="min-h-screen bg-slate-50 pb-12 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <button type="button" aria-label="返回仪表盘" onClick={onBack} className="rounded-lg p-2 hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></button>
          <div><h1 className="text-lg font-extrabold">学习统计</h1><p className="text-xs font-semibold text-slate-400">全年学习档案</p></div>
          <CalendarDays className="ml-auto h-5 w-5 text-orange-500" />
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div><h2 className="text-xl font-extrabold">学习概览</h2><p className="mt-1 text-sm font-semibold text-slate-400">累计记录与学习连续性</p></div>
            {data?.activity?.firstDate && <span className="text-xs font-semibold text-slate-400">每日趋势自 {data.activity.firstDate} 起</span>}
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard value={`${data?.activity?.current || 0} 天`} label="当前连续学习" hint={`最长 ${data?.activity?.longest || 0} 天`} icon={CalendarDays} />
            <StatCard value={legacy.viewed} label="累计看过单词" hint="不同单词去重" icon={BookOpen} />
            <StatCard value={legacy.attempts} label="累计拼写次数" hint={`答对 ${legacy.correct} 次`} icon={SpellCheck2} />
            <StatCard value={percentage(legacy.firstTry, legacy.attempts)} label="首次答对率" hint={`${legacy.pending} 词待复习`} icon={BarChart3} />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><h2 className="text-xl font-extrabold">年度日历</h2><p className="mt-1 text-sm font-semibold text-slate-400">颜色越深，当天学习与拼写越多；点击日期查看详情</p></div>
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              <button type="button" aria-label="上一年" onClick={() => setYear((value) => Math.max(2000, value - 1))} className="rounded-md p-2 hover:bg-white"><ChevronLeft className="h-4 w-4" /></button>
              <select value={year} onChange={(event) => setYear(Number(event.target.value))} className="bg-transparent px-2 py-1 text-sm font-extrabold outline-none">
                {Array.from(new Set([...(data?.years || []), year])).sort((a, b) => b - a).map((value) => <option key={value} value={value}>{value} 年</option>)}
              </select>
              <button type="button" aria-label="下一年" disabled={year >= currentYear} onClick={() => setYear((value) => Math.min(currentYear, value + 1))} className="rounded-md p-2 hover:bg-white disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>

          {loading ? <div className="flex min-h-64 items-center justify-center text-slate-400"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" />正在整理全年记录…</div>
            : error ? <div className="my-8 rounded-xl bg-amber-50 p-5 text-sm font-bold text-amber-700">{error}</div>
              : <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{MONTH_NAMES.map((_, month) => <MonthCalendar key={month} year={year} month={month} dayByDate={dayByDate} selectedDate={selectedDate} onSelectDate={setSelectedDate} />)}</div>}

          <div className="mt-5 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-400">
            <span>少</span>{[0, 1, 6, 15, 30].map((value) => <span key={value} className={`h-4 w-4 rounded border ${activityTone(value)}`} />)}<span>多</span>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-orange-600">{selectedDate}</p>
            <h2 className="mt-1 text-xl font-extrabold">当天详情</h2>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {[[selectedDay.wordViews, "学习单词"], [selectedDay.spellingAttempts, "拼写次数"], [selectedDay.correct, "拼写正确"], [percentage(selectedDay.correct, selectedDay.spellingAttempts), "正确率"], [selectedDay.firstTryCorrect, "首次答对"], [selectedDay.reviewAttempts, "错词复习"]].map(([value, label]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><strong className="block text-xl tabular-nums">{value}</strong><span className="mt-1 block text-xs font-semibold text-slate-400">{label}</span></div>)}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-extrabold">{year} 年汇总</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[[yearTotals.activeDays, "活跃天数"], [yearTotals.wordViews, "学习词数"], [yearTotals.spellingAttempts, "拼写次数"], [percentage(yearTotals.correct, yearTotals.spellingAttempts), "正确率"]].map(([value, label]) => <div key={label} className="rounded-lg bg-orange-50 p-3"><strong className="block text-xl text-orange-700 tabular-nums">{value}</strong><span className="mt-1 block text-xs font-semibold text-orange-600/70">{label}</span></div>)}
            </div>
            <div className="mt-5 space-y-2">
              {monthly.map((month) => {
                const peak = Math.max(1, ...monthly.map((item) => item.wordViews + item.spellingAttempts));
                const amount = month.wordViews + month.spellingAttempts;
                return <div key={month.name} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3"><span className="text-xs font-bold text-slate-500">{month.name}</span><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-orange-400" style={{ width: `${amount / peak * 100}%` }} /></div><span className="w-20 text-right text-xs font-semibold tabular-nums text-slate-400">{month.activeDays} 天 · {amount}</span></div>;
              })}
            </div>
          </div>
        </section>

        {data?.books?.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-extrabold">词书学习分布</h2>
          <div className="mt-4 divide-y divide-slate-100">{data.books.map((book) => <div key={book.id} className="grid grid-cols-[1fr_auto] gap-3 py-3"><div><strong className="block truncate text-sm">{book.title}</strong><span className="mt-1 block text-xs font-semibold text-slate-400">活跃 {book.activeDays} 天 · 学习 {book.words} 词</span></div><span className="self-center text-sm font-extrabold text-orange-600">拼写 {book.spellingAttempts}</span></div>)}</div>
        </section>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-extrabold">薄弱单词</h2><p className="mt-1 text-sm font-semibold text-slate-400">优先显示仍待复习、错误次数较多的单词</p></div><span className="text-sm font-bold text-orange-600">{legacy.pending} 词待复习</span></div>
          {weakWords.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2">{weakWords.map(({ id, record, word }) => <button type="button" key={id} onClick={() => onOpenWord(id)} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 text-left transition hover:border-orange-200 hover:bg-orange-50"><span className="min-w-0"><strong className="block truncate">{word.term}</strong><span className="mt-1 block truncate text-xs font-semibold text-slate-400">{word.pos} {word.meaning}</span></span><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${needsSpellingReview(record) ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-500"}`}>错 {record.errors} 次</span></button>)}</div>
            : <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-7 text-center text-sm font-semibold text-slate-400"><RotateCcw className="mx-auto mb-2 h-5 w-5" />还没有拼写错词记录</div>}
        </section>
      </div>
    </main>
  );
}
