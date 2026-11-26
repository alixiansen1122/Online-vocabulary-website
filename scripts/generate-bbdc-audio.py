import asyncio
import json
import os
import random
import re
import sys
import time
import unicodedata
from pathlib import Path

import edge_tts

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
BOOK_FILE = ROOT / "src" / "data" / "bbdc-yszch.json"
OUTPUT_DIR = Path(os.environ.get("AUDIO_OUTPUT", ROOT / "public" / "audio")).resolve()
FAILED_FILE = OUTPUT_DIR / "failed.txt"
LIMIT = int(os.environ.get("AUDIO_LIMIT", "0"))
CONCURRENCY = int(os.environ.get("AUDIO_CONCURRENCY", "24"))
ACCENTS = [item.strip() for item in os.environ.get("ACCENTS", "us,uk").split(",") if item.strip()]

# Standard sweet, clear female voices for US and UK word pronunciation
VOICES = {
    "us": "en-US-EmmaNeural",
    "uk": "en-GB-LibbyNeural",
}


def audio_file_name(term: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(term).strip().lower())
    ascii_text = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    slug = re.sub(r"[^a-z0-9-]+", "_", ascii_text).strip("_")
    return f"{slug or 'word'}.mp3"


def clean_spoken_term(term: str) -> str:
    return re.sub(r"-\s+", "-", str(term).strip())


def load_words() -> list[str]:
    with BOOK_FILE.open("r", encoding="utf-8") as file:
        book = json.load(file)
    words = []
    seen = set()
    for chapter in book.get("chapters", []):
        for word in chapter.get("words", []):
            term = str(word.get("term", "")).strip()
            key = audio_file_name(term)
            if term and key not in seen:
                seen.add(key)
                words.append(term)
    return words[:LIMIT] if LIMIT > 0 else words


async def warmup(voice: str) -> None:
    communicate = edge_tts.Communicate("hello", voice)
    async for _ in communicate.stream():
        pass


async def generate_one(
    accent: str,
    voice: str,
    term: str,
    semaphore: asyncio.Semaphore,
    progress: dict,
    max_attempts: int = 4,
) -> bool:
    output = OUTPUT_DIR / accent / audio_file_name(term)
    if output.exists() and output.stat().st_size > 0:
        progress["done"] += 1
        return True

    output.parent.mkdir(parents=True, exist_ok=True)
    temp_output = output.with_suffix(f".{os.getpid()}.{random.randint(1000, 9999)}.part")
    spoken = clean_spoken_term(term)

    async with semaphore:
        for attempt in range(1, max_attempts + 1):
            try:
                communicate = edge_tts.Communicate(spoken, voice)
                await communicate.save(str(temp_output))
                if temp_output.exists() and temp_output.stat().st_size > 0:
                    temp_output.replace(output)
                    progress["done"] += 1
                    done = progress["done"]
                    total = progress["total"]
                    if done % 200 == 0 or done == total:
                        elapsed = time.time() - progress["start"]
                        rate = done / elapsed if elapsed > 0 else 0
                        print(f"[progress] {done}/{total} ({done * 100 / total:.1f}%) - {rate:.1f} files/s", flush=True)
                    return True
            except Exception as err:
                if temp_output.exists():
                    try:
                        temp_output.unlink()
                    except OSError:
                        pass
                if attempt == max_attempts:
                    print(f"[{accent}] failed: {term} ({err})", flush=True)
                    return False
                await asyncio.sleep(1.2 * attempt + random.uniform(0.1, 0.6))

    return False


async def main() -> None:
    words = load_words()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if FAILED_FILE.exists():
        FAILED_FILE.unlink()

    valid_accents = [(accent, VOICES[accent]) for accent in ACCENTS if accent in VOICES]
    if not valid_accents:
        print("No valid accents configured.")
        return

    print(f"Warming up edge-tts with {valid_accents[0][1]}...", flush=True)
    await warmup(valid_accents[0][1])

    work_items = [(accent, voice, term) for accent, voice in valid_accents for term in words]
    progress = {"done": 0, "total": len(work_items), "start": time.time()}
    print(
        f"Generating {len(work_items)} word audio files ({len(words)} words x {len(valid_accents)} accents) into {OUTPUT_DIR}...",
        flush=True,
    )

    semaphore = asyncio.Semaphore(CONCURRENCY)
    results = await asyncio.gather(
        *(generate_one(accent, voice, term, semaphore, progress, max_attempts=4) for accent, voice, term in work_items)
    )

    failed_items = [item for item, ok in zip(work_items, results) if not ok]
    if failed_items:
        print(f"Retrying {len(failed_items)} failed items at lower concurrency...", flush=True)
        retry_semaphore = asyncio.Semaphore(6)
        retry_results = await asyncio.gather(
            *(
                generate_one(accent, voice, term, retry_semaphore, progress, max_attempts=5)
                for accent, voice, term in failed_items
            )
        )
        still_failed = [item for item, ok in zip(failed_items, retry_results) if not ok]
    else:
        still_failed = []

    if still_failed:
        with FAILED_FILE.open("w", encoding="utf-8") as file:
            for accent, _, term in still_failed:
                file.write(f"{accent}\t{term}\n")
        print(f"Completed with {len(still_failed)} failures logged to {FAILED_FILE}", flush=True)
        sys.exit(1)

    elapsed = time.time() - progress["start"]
    print(f"All {len(work_items)} audio files generated successfully in {elapsed:.1f}s!", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
