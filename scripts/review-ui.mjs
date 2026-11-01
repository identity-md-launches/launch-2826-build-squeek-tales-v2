import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const output = path.resolve(
  process.env.SQUEEK_REVIEW_OUTPUT ?? "test/scratch/review",
);
fs.mkdirSync(output, { recursive: true });
const root = path.resolve("dist");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".woff2": "font/woff2",
};
const server = createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const file = path.resolve(
    root,
    url.replace(/^\/preview\//, "") || "index.html",
  );
  if (!url.startsWith("/preview/") || !file.startsWith(root + path.sep)) {
    res.writeHead(404).end();
    return;
  }
  try {
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file)] ?? "application/octet-stream",
    });
    res.end(fs.readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const results = {
  viewports: [],
  audits: [],
  contrast: [],
  pageErrors: [],
  localResourceErrors: [],
};
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", (e) => results.pageErrors.push(e.message));
  page.on("response", (response) => {
    if (response.url().startsWith(url) && response.status() >= 400)
      results.localResourceErrors.push({
        url: new URL(response.url()).pathname,
        status: response.status(),
      });
  });
  await page.goto(url);
  await page
    .waitForSelector(".chapter-proof", { timeout: 45000 })
    .catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const state = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
      actionBottom: document
        .querySelector(".vote-action")
        .getBoundingClientRect().bottom,
      fonts: [...document.fonts].map((f) => ({
        family: f.family,
        status: f.status,
      })),
      chapter: document.querySelector(".chapter-meta").textContent,
    }));
    assert(!state.overflow, `${width}px overflows`);
    if (width === 390)
      assert(
        state.actionBottom <= 844,
        `Primary action ends at ${state.actionBottom}`,
      );
    results.viewports.push(state);
    if (width === 390 || width === 1440) {
      await page.screenshot({
        path: path.join(output, `live-${width}.png`),
        fullPage: width === 1440,
      });
      const audit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      results.audits.push({
        state: `live-${width}`,
        violations: audit.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          nodes: v.nodes.map((n) => n.target),
        })),
        passes: audit.passes.length,
        incomplete: audit.incomplete.map((v) => v.id),
      });
    }
  }
  results.contrast = await page.evaluate(() => {
    const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const lum = (c) =>
      c
        .map((x) => x / 255)
        .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
        .reduce((v, x, i) => v + x * [0.2126, 0.7152, 0.0722][i], 0);
    const root = getComputedStyle(document.documentElement);
    const pairs = [
      ["Body on page", "body", null],
      ["Muted on page", ".intro p", null],
      ["Primary action", ".vote-action", ".vote-action"],
      [
        "Selected path",
        ".path-option.selected strong",
        ".path-option.selected",
      ],
      ["Rewards panel", ".rewards-panel", ".rewards-panel"],
      [
        "Unselected radio boundary",
        ".path-option:not(.selected) .radio-mark",
        ".path-option:not(.selected)",
      ],
    ];
    return pairs.map(([role, fg, bg]) => {
      const ink = getComputedStyle(document.querySelector(fg));
      const background = bg
        ? getComputedStyle(document.querySelector(bg)).backgroundColor
        : root.backgroundColor;
      const foreground = role.includes("boundary")
        ? ink.borderColor
        : ink.color;
      const values = [lum(rgb(foreground)), lum(rgb(background))].sort(
        (a, b) => b - a,
      );
      return {
        role,
        foreground,
        background,
        ratio:
          Math.round(((values[0] + 0.05) / (values[1] + 0.05)) * 100) / 100,
        minimum: role.includes("boundary") ? 3 : 4.5,
      };
    });
  });
  for (const pair of results.contrast)
    assert(pair.ratio >= pair.minimum, JSON.stringify(pair));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("input[name=branch]").first().focus();
  await page.keyboard.press("ArrowRight");
  await page.screenshot({ path: path.join(output, "keyboard-focus-390.png") });
  await page.locator(".wallet-button").click();
  const modalAudit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  results.audits.push({
    state: "wallet-390",
    violations: modalAudit.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target),
    })),
    passes: modalAudit.passes.length,
    incomplete: modalAudit.incomplete.map((v) => v.id),
  });
  await page.screenshot({ path: path.join(output, "wallet-390.png") });
  await page.mouse.click(10, 10);
  assert.equal(
    await page.locator(".wallet-modal").evaluate((e) => e.open),
    false,
  );
  await page.evaluate(() => (document.documentElement.dir = "rtl"));
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  results.rtlMirror =
    "390px: no horizontal overflow; English-only layout stress test";
  await page.evaluate(() => (document.documentElement.dir = "ltr"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  results.reducedMotion = await page.evaluate(() => ({
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    activeAnimations: document
      .getAnimations()
      .filter((a) => a.playState === "running").length,
  }));
  assert.equal(results.reducedMotion.scrollBehavior, "auto");
  assert.equal(results.reducedMotion.activeAnimations, 0);
  fs.writeFileSync(
    path.join(output, "results.json"),
    JSON.stringify(results, null, 2) + "\n",
  );
  assert.deepEqual(results.pageErrors, []);
  assert.deepEqual(results.localResourceErrors, []);
  assert(
    results.audits.every((a) => a.violations.length === 0),
    JSON.stringify(results.audits),
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
