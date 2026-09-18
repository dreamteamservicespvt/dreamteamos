import { chromium } from "file:///C:/Users/chala/AppData/Roaming/npm/node_modules/playwright/index.mjs";
const URL = "http://localhost:5188/login";
const b = await chromium.launch();
const out = [];
const look = async (label, opts, seed) => {
  const ctx = await b.newContext(opts);
  const p = await ctx.newPage();
  if (seed !== undefined) {
    await p.addInitScript((v) => { try { localStorage.setItem("theme", v); } catch {} }, seed);
  }
  await p.goto(URL, { waitUntil: "networkidle" });
  await p.waitForTimeout(900);
  const info = await p.evaluate(() => ({
    cls: document.documentElement.className,
    stored: (() => { try { return localStorage.getItem("theme"); } catch { return "?"; } })(),
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  out.push({ label, ...info });
  await ctx.close();
};
await look("fresh browser, device DARK", { colorScheme: "dark" });
await look("fresh browser, device LIGHT", { colorScheme: "light" });
await look("fresh browser, no preference", { colorScheme: "no-preference" });
await look("returning user who picked Light", { colorScheme: "dark" }, "light");
await look("returning user who picked System, device LIGHT", { colorScheme: "light" }, "system");
await b.close();
for (const r of out) console.log(`${r.label.padEnd(45)} class="${r.cls}" stored=${r.stored} bg=${r.bg}`);
