import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PYTHON = process.env.PYTHON || (process.platform === "win32" ? "py" : "python3");
const scriptPath = path.join(ROOT, "scripts", "generate-bbdc-audio.py");

const child = spawn(PYTHON, [scriptPath], {
  cwd: ROOT,
  stdio: "inherit",
  shell: false,
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
