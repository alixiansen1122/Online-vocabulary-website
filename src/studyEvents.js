import { useCallback, useEffect, useRef, useState } from "react";
import { chinaDateKey } from "./studyStats";

const QUEUE_KEY = "word-memory-study-events-v1";
const BATCH_SIZE = 100;

function readQueue() {
  try {
    const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function createEventId(event) {
  if (event.type === "word_viewed") {
    return `word_viewed:${chinaDateKey(event.occurredAt)}:${String(event.wordId || "").slice(0, 180)}`;
  }
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `event:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export function useStudyEventQueue() {
  const queueRef = useRef([]);
  const flushingRef = useRef(false);
  const timerRef = useRef(null);
  const [revision, setRevision] = useState(0);

  const persist = useCallback(() => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queueRef.current));
  }, []);

  const flush = useCallback(async () => {
    if (flushingRef.current || queueRef.current.length === 0) return;
    flushingRef.current = true;
    try {
      while (queueRef.current.length) {
        const batch = queueRef.current.slice(0, BATCH_SIZE);
        const response = await fetch("/api/stats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events: batch }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "学习统计同步失败");
        const sentIds = new Set(batch.map((event) => event.id));
        queueRef.current = queueRef.current.filter((event) => !sentIds.has(event.id));
        persist();
        setRevision((value) => value + 1);
      }
    } catch {
      // Events remain in local storage and retry when the browser comes online.
    } finally {
      flushingRef.current = false;
    }
  }, [persist]);

  const enqueue = useCallback((candidate) => {
    if (!candidate?.type || !candidate?.wordId) return;
    const occurredAt = Number(candidate.occurredAt) || Date.now();
    const event = {
      id: candidate.id || createEventId({ ...candidate, occurredAt }),
      type: candidate.type,
      occurredAt,
      wordId: String(candidate.wordId),
      wordTerm: String(candidate.wordTerm || ""),
      bookId: String(candidate.bookId || ""),
      bookTitle: String(candidate.bookTitle || ""),
      correct: candidate.correct === true,
      firstTry: candidate.firstTry === true,
      review: candidate.review === true,
    };
    const index = queueRef.current.findIndex((item) => item.id === event.id);
    if (index >= 0) queueRef.current[index] = event;
    else queueRef.current.push(event);
    persist();
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, 700);
  }, [flush, persist]);

  useEffect(() => {
    queueRef.current = readQueue();
    flush();
    const retry = () => flush();
    window.addEventListener("online", retry);
    return () => {
      window.removeEventListener("online", retry);
      window.clearTimeout(timerRef.current);
    };
  }, [flush]);

  return { enqueueStudyEvent: enqueue, flushStudyEvents: flush, statsRevision: revision };
}
