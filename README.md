# Squeek Tales v2

A living hamster story with a responsive static frontend and a Sepolia voting/rewards contract. The export is in `dist/`; all fonts, artwork, wallet marks and share assets are local.

**Launch status:** live Squeekchain reads and practice play work. No authorized Sepolia signer or test ETH was supplied, so this run did not deploy or fund a public voting contract. `public/deployment.json` deliberately has `contractAddress: null`. The interface states this and offers a wallet-based deploy-and-fund flow. It never shows sample votes, invented rewards or a pretend deployment as live.

## Install, preview and rebuild

Node 24 and npm 11 were used for validation.

```sh
npm ci
npm run typecheck
npm run build
npm run preview
```

Open the URL printed by Vite. `npm run dev` starts source development. `npm run build` emits the complete static export into `dist/`. Vite’s `base: './'` keeps its asset URLs relative. One page with anchors works at a gateway subpath without server rewrites.

The worker installed dependencies and performed builds in an isolated temporary directory, leaving no `node_modules/` in the submitted repository. A normal local `npm ci` uses the provided lockfile. Dependencies, browser downloads and package caches are not delivery artifacts.

## Play

Read the latest certified chapter and choose a path. Without a deployed voting contract, **Preview this path** opens a clearly labeled, session-local practice story. **Take this path** continues it. The journal shows the session’s practice pages or the latest 12 certified live rounds. Practice has no leaderboard, transactions or rewards.

With a configured contract, connect a wallet, switch to Sepolia and vote in the open measurement round. There is one vote per wallet per round. The winning path becomes that round’s chapter only after SqueekCore certifies it. Votes cannot be changed. A round ending does not itself settle it.

The game classifies settled work as follows. These are authored game rules, not official animal-behavior classifications:

| Settled work | Story mood |
| ------------ | ---------- |
| 0            | Nap        |
| 1–599        | Jog        |
| 600 or more  | Zoomies    |

Chapters combine the settled round ID, its work, the winning branch and short authored continuations. The three paths are Firefly Hollow, Pebblebrook and Cloverwood. Voting ties, including zero ballots, favor path 0 (fireflies). Before deployment, the live narrative follows Cloverwood. Practice uses an authored Jog / Zoomies / Nap sequence; it is not simulated chain telemetry.

## After launch: deploy and enable voting

No private key, owner address, relayer account, WalletConnect project ID or backend is needed in the source. The voting contract has no privileged allocator or withdrawal owner. “Owner-run” below means the site operator using their own wallet.

1. Open **Contract & setup** in the footer, or the `#setup` view. Wait for verified Squeekchain data.
2. Connect an authorized wallet with at least **0.0055 Sepolia ETH plus deployment gas**, and switch it to Sepolia.
3. Select **Deploy + fund 0.0055 ETH**. The wallet signs the deployment of the exact compiled contract in `src/generated/SqueekTales.json`; its constructor receives the verified current SqueekCore address and the pool deposit.
4. Wait for two confirmations. The utility displays the real transaction hash and verifies the new runtime code, core address and immutable round configuration.
5. Download `deployment.json`, replace `public/deployment.json` with it, and run `npm run build`. Include the updated source configuration and `dist/` in the site’s next publication so every browser uses the same contract.
6. Fund more reward days through **Fund pool with 0.0055 ETH** in the utility, or send Sepolia ETH directly to the contract’s payable address. A complete top-10 day uses 0.0055 ETH. There is no owner withdrawal; deposits remain available for eligible claims.

An existing deployment of this release can be linked by its actual Sepolia address. Verification rejects another release or a different active SqueekCore. The temporary selection is stored only in that browser until its exported configuration is published. **Use the published contract setting** clears this local override. No invented address or test fixture is present in the public configuration.

If Squeekchain changes its core deployment, the site pauses incompatible voting instead of guessing an address. Preserve old contract addresses and their outstanding claims when planning a migration; the contract itself has no upgrade or withdrawal mechanism.

## Daily rewards

The contract counts a vote toward `block.timestamp / 86400`, the UTC day when the vote is mined. The top ten are updated on-chain in bounded work. Higher vote counts rank first; ties retain the earliest wallet to reach that count. Sybil resistance is per wallet only.

| Final rank | Sepolia ETH |
| ---------- | ----------- |
| 1          | 0.001       |
| 2          | 0.0009      |
| 3          | 0.0008      |
| 4          | 0.0007      |
| 5          | 0.0006      |
| 6          | 0.0005      |
| 7          | 0.0004      |
| 8          | 0.0003      |
| 9          | 0.0002      |
| 10         | 0.0001      |

Today’s ranks are provisional. After 00:00 UTC, choose **Yesterday** or a past UTC date and claim from the ranked wallet. Unfilled ranks do not receive rewards. A claim can succeed once per wallet per day; it never expires. All days share one pool, with no per-day escrow or automatic refill. Underfunded claims wait for a pool top-up and retain their entitlement. Claims pay the caller directly using checks-effects-interactions; a failed receiver transfer rolls back the claimed flag.

Both voting and claiming show wallet-signature, pending, confirmed or failed status and a full explorer transaction hash. The status names the vote’s round or the claim’s date. Receipt waits require two confirmations. A timeout stays **unknown**, with a recheck action, and blocks another transaction of that kind until checked. Pending hashes survive reload when browser storage is available. Repriced transactions follow their new hash; replacements/cancellations are labeled for review.

## Wallets and sources

`src/lib/config.ts` uses wagmi 3, EIP-6963 multi-provider discovery, `injected()` and Coinbase Wallet SDK. The single header control opens the named browser-wallet rows or mobile app links, then Coinbase Wallet / Smart Wallet. Mobile MetaMask, Coinbase, Rabby and Phantom open the current page in the wallet’s browser. There is no relay or project ID. Unknown-network switching uses the connector’s add-chain fallback with Sepolia parameters.

Story reads use the public [Squeekchain API](https://docs.squeekchain.com/developers/api/) at `https://api.squeekchain.com/v1/core` and Sepolia RPC `https://ethereum-sepolia-rpc.publicnode.com`, with `https://rpc.sepolia.org` as fallback. The worker observed that the API’s active core differed from the older deployment documentation. The application therefore resolves the active core from the API and verifies its state, V3 identity, implementation code/hash and configuration at the API’s safe block before reading history.

`roundPage()` is expanded only through its certified frontier: omitted rounds within that span are zero work; future or unobserved rounds are never inferred as zero. Polling is every 15 seconds. Story updates pause on an unavailable source, identity mismatch or stale verification. The page retains the last verified chapter and offers retry/practice. A measurement countdown is shown separately from settlement.

Voting and reward reads come from the configured contract, not browser storage. Runtime verification compares the compiled bytecode outside its declared immutable slots and separately checks the actual core and round constants. No off-chain leaderboard, reward signer, reward-allocation server or keeper is required.

See [SqueekCore](https://docs.squeekchain.com/developers/core/) and [round semantics](https://docs.squeekchain.com/system/rounds-and-blocks/). The UI depends on the public API/RPC for reads. Direct contract calls remain possible if those display services fail.

## Contract and validation commands

```sh
npm run compile:contract
npm run test:contract
npx playwright install chromium
SQUEEK_BROWSERS=chromium npm run test:interactions
npm run review:ui
npm run typecheck
npm run build
npm run check:bundle
```

`compile:contract` uses Solidity 0.8.30, optimizer 200 runs and the Paris EVM target. It regenerates the ABI, creation/runtime bytecode and immutable reference map. Rebuild the site after changing the contract. `npm run share:card` regenerates the included 1200 × 630 PNG using Playwright.

The contract tests and wallet interaction fixtures use an in-memory Ganache EVM with Sepolia’s chain ID. Their accounts and funding are disposable local fixtures, not public Sepolia deployments. The browser suite serves the actual `dist/` at `/preview/` and routes test API/RPC reads to that EVM. It does not establish that a public transaction was signed.

Actual worker results:

| Check                                 | Result                                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Production build and TypeScript check | Passed                                                                                             |
| Contract scenarios                    | 15 passed                                                                                          |
| Chromium interaction scenarios        | 14 passed; zero page errors                                                                        |
| Pinned taste@1 probe                  | 16/16 passed at 320, 390 and 1440px                                                                |
| Live export review                    | 320, 390, 768 and 1440px; no horizontal overflow or failed local assets                            |
| Axe audits                            | Zero reported violations in live 390px, live 1440px and wallet 390px states; some rules incomplete |
| Mobile first screen                   | Product and complete primary action visible at 390 × 844                                           |
| Live public source                    | Verified Squeekchain reads observed in Chromium                                                    |
| Public deployment/funding             | Not performed; operator flow supplied                                                              |
| Safari/WebKit                         | Unverified: runtime could not create a WPE EGL display/automation page                             |

Vite reported dependency `use client` directives and a `node:worker_threads` externalization from the wallet dependency graph. The rendered Chromium app had no script errors. Ganache used its JavaScript transport fallback because its optional native µWS binary did not match Node 24. These warnings did not prevent the recorded tests.

The six-domain design review, source findings, repairs, measurements and precise limitations are in [artifacts/validation.md](artifacts/validation.md). The implemented tokens, components and responsive behavior are in [DESIGN.md](DESIGN.md). Raw concise results and final screenshots are in `artifacts/`. These are worker-side evidence, not an independent certification.

Unperformed checks include public Sepolia signing, actual wallet-app handoff/passkeys, physical phones, native browser 200% zoom, screen readers and full forced-colors interaction. No audit claim is made from the automated checks.

## Hosting and submission budget

The publisher consumes the included `dist/index.html` and its assets without rebuilding. The export is suitable for IdentityMD’s `*.imd.site` publication step. A hosted name is assigned by that pipeline; this run has no published URL to report and made no external publication call.

The total added deliverable must remain below 8,388,608 bytes. `npm run check:bundle` checks the required files, local relative assets, packaging hygiene and total bytes. The final measured breakdown is in `artifacts/bundle-report.json`.

Explicit path budgets, including the `.gitignore` change:

| Added path                                                         | Maximum bytes |
| ------------------------------------------------------------------ | ------------: |
| `dist/`                                                            |     2,097,152 |
| `public/`                                                          |       524,288 |
| `src/`                                                             |       524,288 |
| `contracts/`                                                       |        65,536 |
| `scripts/`                                                         |       262,144 |
| `artifacts/`                                                       |     2,097,152 |
| Root manifests, lockfile, docs and `.gitignore`                    |     1,048,576 |
| `**/node_modules/`, `**/.vite/`, `**/.cache/`, `**/coverage/`      |             0 |
| `**/playwright-report/`, `**/test-results/`, `**/.playwright-mcp/` |             0 |
| `test/scratch/`                                                    |             0 |

No dependency directories, caches, registry archives, vendored npm registry, source maps or submodules are part of the deliverable. `dist/` is intentionally not ignored.

## Attribution

Original scene, favicon and story text are included as source. Font, wallet-mark and design-guide attribution and license texts are documented in [THIRD_PARTY.md](THIRD_PARTY.md) and `artifacts/licenses/`.
