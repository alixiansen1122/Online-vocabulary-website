import asyncio
import json
import os
import sys
from pathlib import Path
from urllib.parse import quote

import edge_tts

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
BOOK_FILE = ROOT / "src" / "data" / "bbdc-yszch.json"
OUTPUT_DIR = Path(os.environ.get("AUDIO_OUTPUT", ROOT / "generated-audio")).resolve()
FAILED_FILE = OUTPUT_DIR / "failed.txt"
LIMIT = int(os.environ.get("AUDIO_LIMIT", "0"))
CONCURRENCY = int(os.environ.get("AUDIO_CONCURRENCY", "6"))
ACCENTS = [item.strip() for item in os.environ.get("ACCENTS", "us,uk").split(",") if item.strip()]

VOICES = {
    "us": "en-US-AriaNeural",
    "uk": "en-GB-SoniaNeural",
}


def audio_file_name(term):
    return f"{quote(term.strip().lower(), safe='')}.mp3"


def load_words():
    with BOOK_FILE.open("r", encoding="utf-8") as file:
        book = json.load(file)
    words = []
    seen = set()
    for chapter in book.get("chapters", []):
        for word in chapter.get("words", []):
            term = str(word.get("term", "")).strip()
            key = term.lower()
            if term and key not in seen:
                seen.add(key)
                words.append(term)
    return words[:LIMIT] if LIMIT > 0 else words


async def generate_one(accent, voice, term, index, total, semaphore):
    output = OUTPUT_DIR / accent / audio_file_name(term)
    if output.exists() and output.stat().st_size > 0:
        return
    output.parent.mkdir(parents=True, exist_ok=True)

    async with semaphore:
        for attempt in range(1, 4):
            try:
                print(f"[{accent}] {index}/{total} {term}")
                communicate = edge_tts.Communicate(term, voice)
                await communicate.save(str(output))
                return
            except Exception:
                if attempt == 3:
                    with FAILED_FILE.open("a", encoding="utf-8") as file:
                        file.write(f"{accent}\t{term}\n")
                    print(f"[{accent}] failed after retries: {term}")
                    return
                await asyncio.sleep(1.5 * attempt)


async def main():
    words = load_words()
    semaphore = asyncio.Semaphore(CONCURRENCY)
    tasks = []
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if FAILED_FILE.exists():
        FAILED_FILE.unlink()

    for accent in ACCENTS:
        voice = VOICES.get(accent)
        if not voice:
            print(f"Skipping unknown accent: {accent}")
            continue
        for index, term in enumerate(words, 1):
            tasks.append(generate_one(accent, voice, term, index, len(words), semaphore))

    await asyncio.gather(*tasks)


if __name__ == "__main__":
    asyncio.run(main())
