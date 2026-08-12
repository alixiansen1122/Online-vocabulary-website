import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import bbdcBook from "../src/data/bbdc-yszch.json" with { type: "json" };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.resolve(ROOT, process.env.AUDIO_OUTPUT || "generated-audio");
const PYTHON = process.env.PYTHON || (process.platform === "win32" ? "py" : "python3");
const LIMIT = Number.parseInt(process.env.AUDIO_LIMIT || "0", 10);
const ACCENTS = (process.env.ACCENTS || "us,uk")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const VOICES = {
  us: "en-US-AriaNeural",
  uk: "en-GB-SoniaNeural",
};

function audioFileName(term) {
  return `${encodeURIComponent(String(term).trim().toLowerCase())}.mp3`;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: "inherit",
      shell: false,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

const words = bbdcBook.chapters.flatMap((chapter) => chapter.words);
const uniqueWords = Array.from(new Map(words.map((word) => [word.term.toLowerCase(), word.term])).values());
const selectedWords = LIMIT > 0 ? uniqueWords.slice(0, LIMIT) : uniqueWords;

await mkdir(OUTPUT_DIR, { recursive: true });

for (const accent of ACCENTS) {
  const voice = VOICES[accent];
  if (!voice) {
    console.warn(`Skipping unknown accent: ${accent}`);
    continue;
  }

  const accentDir = path.join(OUTPUT_DIR, accent);
  await mkdir(accentDir, { recursive: true });

  for (const [index, term] of selectedWords.entries()) {
    const output = path.join(accentDir, audioFileName(term));
    if (await exists(output)) continue;

    console.log(`[${accent}] ${index + 1}/${selectedWords.length} ${term}`);
    await run(PYTHON, [
      "-m",
      "edge_tts",
      "--voice",
      voice,
      "--text",
      term,
      "--write-media",
      output,
    ]);
  }
}
