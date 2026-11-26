import { access, cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export function sites() {
  let root = process.cwd();

  return {
    name: "sites",
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    async closeBundle() {
      const outputDirectory = resolve(root, "dist", ".openai");
      const hostingConfig = resolve(root, ".openai", "hosting.json");
      const drizzleSource = resolve(root, "drizzle");
      const bundledAudio = resolve(root, "dist", "audio");
      const bundledClientAudio = resolve(root, "dist", "client", "audio");

      if (process.env.OMIT_OFFLINE_AUDIO === "1") {
        await rm(bundledAudio, { recursive: true, force: true });
        await rm(bundledClientAudio, { recursive: true, force: true });
      }
      await rm(outputDirectory, { recursive: true, force: true });
      await mkdir(outputDirectory, { recursive: true });

      if (await exists(hostingConfig)) {
        await cp(hostingConfig, resolve(outputDirectory, "hosting.json"));
      }
      if (await exists(drizzleSource)) {
        await cp(drizzleSource, resolve(outputDirectory, "drizzle"), {
          recursive: true,
        });
      }
    },
  };
}
