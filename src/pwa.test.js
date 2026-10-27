import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("manifest provides correctly sized install icons and a same-origin standalone launch", () => {
  const manifest = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url)));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  for (const icon of manifest.icons) {
    const png = readFileSync(new URL(`../public${icon.src}`, import.meta.url));
    const [width, height] = icon.sizes.split("x").map(Number);
    assert.equal(png.readUInt32BE(16), width);
    assert.equal(png.readUInt32BE(20), height);
  }
});

test("offline fallback intercepts only root navigation, leaving auth, API and cross-origin requests untouched", async () => {
  const handlers = {};
  const offline = new Response("offline");
  vm.runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), {
    self: { location: { origin: "https://example.test" }, addEventListener: (type, handler) => { handlers[type] = handler; } },
    URL, Response, caches: { match: async () => offline }, fetch: async () => { throw new Error("offline"); },
  });
  for (const [url, mode, method] of [["/api/state", "cors", "GET"], ["/callback", "navigate", "GET"], ["/signout-with-chatgpt", "navigate", "GET"], ["/", "navigate", "POST"], ["https://other.test/", "navigate", "GET"]]) {
    let intercepted = false;
    handlers.fetch({ request: { url: new URL(url, "https://example.test").href, mode, method }, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false, url);
  }
  let response;
  handlers.fetch({ request: { url: "https://example.test/", mode: "navigate", method: "GET" }, respondWith: (value) => { response = value; } });
  assert.equal(await (await response).text(), "offline");
});
