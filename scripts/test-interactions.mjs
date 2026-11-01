import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { chromium, webkit } from "playwright";
import { keccak256, parseEther } from "viem";
import { makeChain } from "./test-chain.mjs";
const output = path.resolve(
  process.env.SQUEEK_TEST_OUTPUT ?? "test/scratch/interactions",
);
fs.mkdirSync(output, { recursive: true });
const dist = path.resolve("dist");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".woff2": "font/woff2",
};
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(
    new URL(req.url, "http://localhost").pathname,
  );
  if (!pathname.startsWith("/preview/")) {
    res.writeHead(404).end();
    return;
  }
  const file = path.resolve(dist, pathname.slice(9) || "index.html");
  if (!file.startsWith(dist + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] ?? "application/octet-stream",
    });
    res.end(fs.readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
let checks = 0;
let debugPage;
const rpcLog = [];
const results = [];
async function check(name, fn) {
  try {
    await fn();
  } catch (error) {
    if (debugPage && !debugPage.isClosed()) {
      console.error("PAGE STATE:", await debugPage.locator("body").innerText());
      console.error(
        "WALLET METHODS:",
        await debugPage.evaluate(() => window.__walletRequests),
      );
      console.error("RECENT RPC:", JSON.stringify(rpcLog.slice(-20)));
      await debugPage.screenshot({
        path: path.join(output, "failure.png"),
        fullPage: true,
      });
    }
    throw error;
  }
  checks++;
  results.push(name);
  console.log(`PASS ${name}`);
}
const chain = await makeChain({ time: new Date("2026-10-31T20:00:00Z") });
const day = Math.floor(Date.parse("2026-10-31T20:00:00Z") / 86_400_000);
for (let i = 0; i < 10; i++)
  await chain.send(
    "vote",
    [await chain.read("currentRound"), i % 3],
    chain.accounts[i],
  );
await chain.setTime("2026-11-01T13:30:00Z");
await chain.coreWrite("setSettled", [4n]);
const engines = [
  ["chromium", chromium],
  ["webkit", webkit],
].filter(
  ([name]) =>
    !process.env.SQUEEK_BROWSERS ||
    process.env.SQUEEK_BROWSERS.split(",").includes(name),
);
async function rpc(payload) {
  async function one(p) {
    try {
      rpcLog.push({ method: p.method, params: p.params });
      const params = p.params ?? [];
      if (p.method === "eth_sendTransaction" && !params[0].gas)
        params[0].gas = "0x16e360";
      const result = await chain.provider.request({ method: p.method, params });
      if (p.method === "eth_sendTransaction") {
        await chain.provider.request({ method: "evm_mine", params: [] });
        await chain.provider.request({ method: "evm_mine", params: [] });
      }
      return { id: p.id, jsonrpc: "2.0", result };
    } catch (error) {
      rpcLog.push({ error: error.message, data: error.data });
      return {
        id: p.id,
        jsonrpc: "2.0",
        error: {
          code:
            error.data && /revert/i.test(error.message)
              ? 3
              : (error.code ?? -32603),
          message: error.message,
          data:
            typeof error.data === "string" ? error.data : error.data?.result,
        },
      };
    }
  }
  return Array.isArray(payload) ? Promise.all(payload.map(one)) : one(payload);
}
async function setupRoutes(
  context,
  { deployed = false, failSource = false } = {},
) {
  await context.route("**/v1/core", async (route) => {
    if (failSource) return route.fulfill({ status: 503, body: "Unavailable" });
    const block = await chain.publicClient.getBlock();
    const state = await chain.publicClient.readContract({
      address: chain.core,
      abi: chain.coreArtifact.abi,
      functionName: "state",
    });
    const code = await chain.publicClient.getCode({ address: chain.core });
    return route.fulfill({
      json: {
        status: "available",
        chain: { chainId: "11155111", safeThroughBlock: String(block.number) },
        identities: { core: chain.core, proxyImplementation: chain.core },
        core: { settledThroughRound: String(state.settledThroughRound) },
        configuration: { genesisTimestamp: String(chain.start) },
        implementation: { runtimeHash: keccak256(code) },
      },
    });
  });
  if (deployed)
    await context.route("**/deployment.json", (route) =>
      route.fulfill({
        json: { chainId: 11155111, contractAddress: chain.tales },
      }),
    );
  await context.route(
    /https:\/\/(ethereum-sepolia-rpc\.publicnode\.com|rpc\.sepolia\.org)\/?/,
    async (route) =>
      route.fulfill({ json: await rpc(route.request().postDataJSON()) }),
  );
  await context.route("**/__test-rpc", async (route) =>
    route.fulfill({ json: await rpc(route.request().postDataJSON()) }),
  );
}
async function injectWallet(context, { wrongChain = false } = {}) {
  await context.addInitScript(
    ({ account, wrongChain }) => {
      const listeners = new Map();
      let connected = false;
      let chainId = wrongChain ? "0x1" : "0xaa36a7";
      let chainAdded = !wrongChain;
      window.__walletReject = false;
      window.__walletRequests = [];
      const emit = (event, value) =>
        (listeners.get(event) ?? []).forEach((fn) => fn(value));
      const provider = {
        isMetaMask: true,
        on(event, fn) {
          listeners.set(event, [...(listeners.get(event) ?? []), fn]);
        },
        removeListener(event, fn) {
          listeners.set(
            event,
            (listeners.get(event) ?? []).filter((f) => f !== fn),
          );
        },
        async request({ method, params = [] }) {
          window.__walletRequests.push(method);
          if (method === "eth_requestAccounts") {
            if (window.__walletReject)
              throw { code: 4001, message: "User rejected request" };
            connected = true;
            return [account];
          }
          if (method === "eth_accounts") return connected ? [account] : [];
          if (method === "eth_chainId") return chainId;
          if (method === "wallet_switchEthereumChain") {
            if (!chainAdded) throw { code: 4902, message: "Unknown chain" };
            chainId = params[0].chainId;
            emit("chainChanged", chainId);
            return null;
          }
          if (method === "wallet_addEthereumChain") {
            chainAdded = true;
            chainId = params[0].chainId;
            emit("chainChanged", chainId);
            return null;
          }
          if (method === "wallet_getCapabilities") return {};
          if (method === "eth_sendTransaction" && window.__walletReject)
            throw { code: 4001, message: "User rejected request" };
          const response = await fetch(new URL("__test-rpc", location.href), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
          });
          const data = await response.json();
          if (data.error) throw data.error;
          return data.result;
        },
      };
      window.ethereum = provider;
      const announce = () =>
        dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: {
              info: {
                uuid: "a489af06-6d26-4ea6-948e-875e356be26d",
                name: "Test EIP-6963 wallet",
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
                rdns: "test.local.wallet",
              },
              provider,
            },
          }),
        );
      addEventListener("eip6963:requestProvider", announce);
      announce();
    },
    { account: chain.accounts[0], wrongChain },
  );
}
function bounded(promise, milliseconds, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}
const errors = [];
let snapshot = await chain.provider.request({
  method: "evm_snapshot",
  params: [],
});
try {
  for (const [name, engine] of engines) {
    await chain.provider.request({ method: "evm_revert", params: [snapshot] });
    snapshot = await chain.provider.request({
      method: "evm_snapshot",
      params: [],
    });
    let browser;
    try {
      browser = await engine.launch({
        headless: true,
        timeout: 15000,
        args: name === "chromium" ? ["--no-sandbox"] : [],
      });
    } catch (error) {
      results.push(
        `${name} unavailable: ${error.message.split("\n").slice(0, 6).join(" ")}`,
      );
      console.log(`LIMITATION ${name} could not launch`);
      continue;
    }
    try {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      await setupRoutes(context);
      let page;
      try {
        page = await bounded(
          context.newPage(),
          15_000,
          "Browser could not create an automation page",
        );
      } catch (error) {
        if (name !== "webkit") throw error;
        results.push(`webkit unavailable: ${error.message}`);
        console.log(`LIMITATION webkit: ${error.message}`);
        await context.close();
        continue;
      }
      page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
      await page.goto(url);
      await page.waitForSelector(".chapter-proof");
      await check(
        `${name}: mobile product and complete main action above 844px`,
        async () => {
          const info = await page.locator(".vote-action").evaluate((e) => ({
            bottom: e.getBoundingClientRect().bottom,
            top: e.getBoundingClientRect().top,
          }));
          assert(info.top > 0 && info.bottom <= 844, JSON.stringify(info));
          assert.equal(
            await page.locator("#chapter-heading").innerText(),
            "A very small beginning",
          );
        },
      );
      await check(
        `${name}: responsive reflow at 320, 390, 768, 1440`,
        async () => {
          for (const width of [320, 390, 768, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            assert.equal(
              await page.evaluate(
                () => document.documentElement.scrollWidth > innerWidth,
              ),
              false,
              `${width}px overflow`,
            );
          }
          await page.setViewportSize({ width: 390, height: 844 });
        },
      );
      await check(
        `${name}: native radio keyboard, practice story and journal`,
        async () => {
          await page.locator("input[name=branch]").first().focus();
          await page.keyboard.press("ArrowRight");
          assert.equal(
            await page.locator("input[name=branch]").nth(1).isChecked(),
            true,
          );
          await page.locator(".vote-action").click();
          assert.equal(
            await page.locator("#chapter-heading").innerText(),
            "Across the whispering stream",
          );
          assert.match(
            await page.locator(".practice-notice").innerText(),
            /do not count toward rewards/,
          );
          await page.locator(".path-option").nth(2).click();
          await page.locator(".vote-action").click();
          assert.equal(
            await page.locator("#chapter-heading").innerText(),
            "A knock, a squeak, a quest",
          );
          await page.locator(".journal-button").click();
          assert.equal(
            await page.locator(".journal-modal .journal-entry").count(),
            2,
          );
          await page.keyboard.press("Escape");
          assert.equal(
            await page.locator(".journal-modal").evaluate((e) => e.open),
            false,
          );
          assert.equal(
            await page
              .locator(".journal-button")
              .evaluate((e) => e === document.activeElement),
            true,
          );
          await page.locator(".practice-notice .text-button").click();
          assert.equal(
            await page.locator("#chapter-heading").innerText(),
            "A very small beginning",
          );
        },
      );
      await check(
        `${name}: certified zero-work rounds advance; wall time alone never does`,
        async () => {
          await page.locator(".journal-button").click();
          assert.equal(
            await page.locator(".journal-modal .journal-entry").count(),
            4,
          );
          assert.equal(
            await page
              .locator(".journal-modal .journal-entry")
              .filter({ hasText: "Nap" })
              .count(),
            3,
          );
          assert.equal(
            await page
              .locator(".journal-modal .journal-entry")
              .filter({ hasText: "Jog" })
              .count(),
            1,
          );
          await page.keyboard.press("Escape");
          await chain.setTime("2026-11-01T13:40:00Z");
          await page.reload();
          await page.waitForSelector(".chapter-proof");
          assert.match(
            await page.locator(".chapter-meta").innerText(),
            /Chapter 4/,
          );
          await chain.coreWrite("setSettled", [5n]);
          await page.reload();
          await page.waitForSelector(".chapter-proof");
          assert.match(
            await page.locator(".chapter-meta").innerText(),
            /Chapter 5/,
          );
          assert.match(
            await page.locator(".chapter-proof").innerText(),
            /0 work units/,
          );
        },
      );
      await check(
        `${name}: wallet dialog traps focus, escapes, restores trigger`,
        async () => {
          await page.locator(".wallet-button").click();
          assert.equal(
            await page.locator(".wallet-modal").evaluate((e) => e.open),
            true,
          );
          assert.equal(
            await page
              .getByRole("button", { name: "Browser wallet", exact: true })
              .count(),
            1,
          );
          assert.equal(
            await page
              .getByRole("button", { name: "Coinbase Wallet", exact: true })
              .count(),
            1,
          );
          for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
          assert.equal(
            await page.evaluate(
              () => !!document.activeElement.closest(".wallet-modal"),
            ),
            true,
          );
          await page.keyboard.press("Escape");
          assert.equal(
            await page.locator(".wallet-modal").evaluate((e) => e.open),
            false,
          );
          assert.equal(
            await page
              .locator(".wallet-button")
              .evaluate((e) => e === document.activeElement),
            true,
          );
        },
      );
      await check(
        `${name}: reward schedule has all ten exact amounts`,
        async () => {
          await page
            .getByRole("button", { name: "See all 10 rewards" })
            .click();
          assert.equal(await page.locator(".reward-list li").count(), 10);
          assert.match(
            await page.locator(".reward-list li").first().innerText(),
            /0.001 ETH/,
          );
          assert.match(
            await page.locator(".reward-list li").last().innerText(),
            /0.0001 ETH/,
          );
          await page.keyboard.press("Escape");
        },
      );
      await check(
        `${name}: setup validates address and exposes owner-run deployment`,
        async () => {
          await page.getByRole("button", { name: "Set up voting" }).click();
          await page.locator("#contract-address").fill("invalid");
          await page
            .getByRole("button", { name: "Verify and use contract" })
            .click();
          assert.match(
            await page.locator("#setup-error").innerText(),
            /complete Ethereum/,
          );
          assert.equal(
            await page
              .getByRole("button", { name: "Connect to deploy" })
              .count(),
            1,
          );
          await page.keyboard.press("Escape");
        },
      );
      await check(
        `${name}: local assets and share metadata resolve at gateway subpath`,
        async () => {
          for (const attribute of [
            ['meta[property="og:image"]', "content"],
            ['link[rel="icon"]', "href"],
          ]) {
            const asset = await page
              .locator(attribute[0])
              .getAttribute(attribute[1]);
            const response = await page.request.get(new URL(asset, url).href);
            assert.equal(response.status(), 200);
            assert((await response.body()).length > 100);
          }
          assert.match(await page.title(), /Squeek Tales/);
          assert.equal(
            await page.evaluate(() =>
              [...document.fonts].every((f) => f.status === "loaded"),
            ),
            true,
          );
        },
      );
      await context.close();
      const phone = await browser.newContext({
        viewport: { width: 390, height: 844 },
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      });
      await setupRoutes(phone, { failSource: true });
      const mobile = await phone.newPage();
      await mobile.goto(url);
      await mobile.locator(".wallet-button").click();
      await check(
        `${name}: mobile wallet links and smart wallet are present without relay`,
        async () => {
          for (const wallet of [
            "MetaMask",
            "Coinbase Wallet",
            "Rabby",
            "Phantom",
          ])
            assert.equal(
              await mobile
                .getByRole("link", { name: `Open in ${wallet}`, exact: true })
                .count(),
              1,
            );
          assert.equal(
            await mobile
              .getByRole("button", {
                name: "Coinbase Smart Wallet",
                exact: true,
              })
              .count(),
            1,
          );
          assert.equal(
            await mobile.getByText("Injected", { exact: true }).count(),
            0,
          );
          assert.match(
            await mobile
              .getByRole("link", { name: "Open in Rabby", exact: true })
              .getAttribute("href"),
            /_cmd=open-dapp/,
          );
          const r = await mobile.locator(".wallet-modal").boundingBox();
          assert(Math.abs(r.y + r.height - 844) < 2);
        },
      );
      await mobile.keyboard.press("Escape");
      await check(
        `${name}: unavailable source preserves honest, playable practice`,
        async () => {
          await mobile
            .getByText(
              "Settled rounds could not be verified. You can still try a practice adventure.",
              { exact: true },
            )
            .waitFor();
          await mobile.locator(".vote-action").click();
          assert.match(
            await mobile.locator(".practice-notice").innerText(),
            /do not count toward rewards/,
          );
          assert.equal(await mobile.locator(".chapter-proof").count(), 0);
        },
      );
      await phone.close();
      // Real contract transactions on an in-memory Sepolia-ID EVM; no public signing.
      const connected = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      await setupRoutes(connected, { deployed: true });
      await injectWallet(connected, { wrongChain: true });
      const game = await connected.newPage();
      debugPage = game;
      game.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
      await game.goto(url);
      await game.waitForSelector(".chapter-proof");
      await check(
        `${name}: EIP-6963 name, rejected connection and network add fallback`,
        async () => {
          await game.locator(".wallet-button").click();
          assert.equal(
            await game
              .getByRole("button", { name: "Browser wallet", exact: true })
              .count(),
            0,
          );
          await game.evaluate(() => (window.__walletReject = true));
          await game
            .getByRole("button", { name: "Test EIP-6963 wallet" })
            .click();
          await game
            .getByText("Request declined in your wallet. You can try again.", {
              exact: true,
            })
            .waitFor();
          await game.evaluate(() => (window.__walletReject = false));
          await game
            .getByRole("button", { name: "Test EIP-6963 wallet" })
            .click();
          await game
            .getByRole("button", { name: "Switch to Sepolia", exact: true })
            .waitFor();
          assert.equal(await game.locator(".vote-action").isDisabled(), true);
          await game
            .getByRole("button", { name: "Switch to Sepolia", exact: true })
            .click();
          await game
            .locator(".wallet-button")
            .filter({ hasText: "0x" })
            .waitFor();
          assert(
            (await game.evaluate(() => window.__walletRequests)).includes(
              "wallet_addEthereumChain",
            ),
          );
        },
      );
      await check(
        `${name}: on-chain vote is confirmed with hash; duplicate is disabled`,
        async () => {
          await game
            .getByRole("button", { name: "Vote for this path", exact: true })
            .waitFor();
          await game.waitForFunction(
            () => !document.querySelector(".vote-action").disabled,
          );
          await game.locator(".path-option").nth(1).click();
          await game.locator(".vote-action").click();
          await game
            .getByText(/^Vote for round \d+ confirmed$/)
            .waitFor({ timeout: 30_000 });
          const hash = await game
            .locator(".vote-panel .transaction-hash")
            .innerText();
          assert.match(hash, /0x[a-fA-F0-9]{64}/);
          await game
            .getByRole("button", { name: "You voted this round", exact: true })
            .waitFor();
          assert.equal(await game.locator(".vote-action").isDisabled(), true);
          assert.equal(
            await chain.read("voteOf", [
              await chain.read("currentRound"),
              chain.accounts[0],
            ]),
            2,
          );
        },
      );
      await check(
        `${name}: rejected claim can retry, confirmed claim cannot be repeated`,
        async () => {
          await game
            .getByRole("button", { name: "Yesterday", exact: true })
            .click();
          await game.waitForFunction(
            () => !document.querySelector(".reward-button").disabled,
          );
          await game.evaluate(() => (window.__walletReject = true));
          await game.locator(".reward-button").click();
          await game
            .getByText(/^Reward claim for \d{4}-\d{2}-\d{2} UTC failed$/)
            .waitFor();
          await game.evaluate(() => (window.__walletReject = false));
          await game.locator(".reward-button").click();
          await game
            .getByText(/^Reward claim for \d{4}-\d{2}-\d{2} UTC confirmed$/)
            .waitFor({ timeout: 30_000 });
          await game
            .getByRole("button", { name: "Reward claimed", exact: true })
            .waitFor();
          assert.equal(await game.locator(".reward-button").isDisabled(), true);
          assert.equal(
            await chain.read("claimed", [BigInt(day), chain.accounts[0]]),
            true,
          );
        },
      );
      await connected.close();
      const launcher = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      await setupRoutes(launcher);
      await injectWallet(launcher);
      const launch = await launcher.newPage();
      debugPage = launch;
      await launch.goto(url);
      await launch.waitForSelector(".chapter-proof");
      await check(
        `${name}: wallet deploys, funds, verifies and exports a real local contract`,
        async () => {
          await launch.locator(".wallet-button").click();
          await launch
            .getByRole("button", { name: "Test EIP-6963 wallet" })
            .click();
          await launch
            .locator(".wallet-button")
            .filter({ hasText: "0x" })
            .waitFor();
          await launch.getByRole("button", { name: "Set up voting" }).click();
          await launch
            .getByRole("button", {
              name: "Deploy + fund 0.0055 ETH",
              exact: true,
            })
            .waitFor();
          await launch
            .getByRole("button", {
              name: "Deploy + fund 0.0055 ETH",
              exact: true,
            })
            .click();
          await launch
            .getByText("Voting contract selected", { exact: true })
            .waitFor({ timeout: 30_000 });
          const saved = await launch.evaluate(() =>
            localStorage.getItem("squeek.contract.v2"),
          );
          assert(saved);
          assert(
            (await chain.publicClient.getCode({ address: saved })).length > 100,
          );
          assert.equal(
            await chain.publicClient.getBalance({ address: saved }),
            parseEther("0.0055"),
          );
          const downloading = launch.waitForEvent("download");
          await launch
            .getByRole("button", { name: "Download deployment.json" })
            .click();
          const download = await downloading;
          const data = JSON.parse(
            fs.readFileSync(await download.path(), "utf8"),
          );
          assert.equal(data.chainId, 11155111);
          assert.equal(data.contractAddress.toLowerCase(), saved.toLowerCase());
          assert.match(data.deploymentTransaction, /^0x[a-f0-9]{64}$/i);
          await launch
            .getByRole("button", {
              name: "Fund pool with 0.0055 ETH",
              exact: true,
            })
            .click();
          await launch
            .getByText("Pool funding confirmed", { exact: true })
            .waitFor({ timeout: 30_000 });
          assert.equal(
            await chain.publicClient.getBalance({ address: saved }),
            parseEther("0.011"),
          );
        },
      );
      await launcher.close();
    } finally {
      await browser.close();
    }
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(output, "results.json"),
    JSON.stringify({ checks, results, pageErrors: errors }, null, 2),
  );
  console.log(
    `${checks} interaction scenarios passed. ${errors.length} page errors.`,
  );
} finally {
  await chain.provider.disconnect();
  await new Promise((resolve) => server.close(resolve));
}
