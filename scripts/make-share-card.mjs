import { chromium } from "playwright";
import fs from "node:fs";
const data = (p, mime) =>
  `data:${mime};base64,${fs.readFileSync(p).toString("base64")}`;
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<html><style>@font-face{font-family:display;src:url('${data("public/fonts/bricolage-latin.woff2", "font/woff2")}')}@font-face{font-family:body;src:url('${data("public/fonts/dm-sans-latin.woff2", "font/woff2")}')}*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#fbf8f1;color:#302a22;display:flex;font-family:body}.copy{width:560px;padding:64px 0 64px 64px;position:relative;z-index:1}.brand{font-family:display;font-weight:600;font-size:28px;display:flex;align-items:center;gap:12px}.brand img{width:44px;height:44px}h1{font-family:display;font-size:74px;line-height:1.03;letter-spacing:-4px;margin:64px 0 24px;font-weight:600}p{font-size:24px;line-height:1.5;max-width:420px;color:#71695b;margin:0}.tag{font-size:16px;margin-top:38px;display:flex;align-items:center;gap:9px}.dot{width:8px;height:8px;border-radius:50%;background:#596d44}.art{height:630px;width:640px;object-fit:cover;object-position:50% 64%;border-radius:190px 0 0 0}</style><body><div class="copy"><div class="brand"><img src="${data("public/favicon.svg", "image/svg+xml")}"/>Squeek Tales</div><h1>Little paws.<br/>Big adventures.</h1><p>A living hamster story,<br/>written together.</p><div class="tag"><span class="dot"></span>Choose the next adventure on Sepolia</div></div><img class="art" src="${data("public/hamster-glade.svg", "image/svg+xml")}"/></body></html>`,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "public/share-card.png" });
  console.log("Generated public/share-card.png (1200 × 630)");
} finally {
  await browser.close();
}
