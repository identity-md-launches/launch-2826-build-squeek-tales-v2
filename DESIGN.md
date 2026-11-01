# Squeek Tales design system

## Overview

Squeek Tales is a playable hamster story with a Sepolia voting and rewards layer. The visual idea is a small, illustrated woodland adventure on warm paper. The story and its path choices lead the page; the leaderboard and reward rules follow. This is an English-only interface.

The implementation is React and TypeScript with plain CSS. `src/style.css` is the source of truth for tokens and responsive rules. `src/App.tsx` composes the game. The original local SVG scene, favicon and generated PNG share card live in `public/`.

## Colors

All semantic tokens are defined in `src/style.css` and used by the components. The small palette uses hex values consistently.

| Token                           | Value     | Role                                           |
| ------------------------------- | --------- | ---------------------------------------------- |
| `--color-page`                  | `#fbf8f1` | Warm page background                           |
| `--color-surface`               | `#fffdf8` | Story sheet, controls and dialogs              |
| `--color-subtle`                | `#f2ede2` | Notices and grouped controls                   |
| `--color-border`                | `#e4ddce` | Structural separators and scene frame          |
| `--color-control-border`        | `#9a8d77` | Radio and input boundaries                     |
| `--color-text`, `--color-focus` | `#302a22` | Primary ink and focus ring                     |
| `--color-muted`                 | `#71695b` | Supporting copy                                |
| `--color-accent`                | `#ac4e2f` | Primary action and selected path               |
| `--color-accent-hover`          | `#913e25` | Hovered primary action                         |
| `--color-accent-soft`           | `#f7e8dc` | Selected choice background                     |
| `--color-success`               | `#3c512e` | Rewards, verified feedback and practice notice |
| `--color-success-soft`          | `#eaf0e1` | Rewards background                             |
| `--color-error`                 | `#a1302b` | Recoverable errors                             |

The underlying cream, cocoa, terracotta and sage primitives are also named in `:root`. There is no dark theme. Artwork has its own illustrative palette; it does not set interface status.

Measured rendered contrasts: primary ink/page 13.38:1, muted/page 5.11:1, primary button 5.32:1, selected choice 11.85:1, rewards ink/sage 7.49:1, and unselected radio boundary/surface 3.20:1. See `artifacts/ui-review.json` for the exact foreground/background pairs and audit limitations. Disabled controls are visibly dimmed and have adjacent explanations.

## Typography

Two local variable WOFF2 faces load with `font-display: swap`:

- `DM Sans`, falling back to `sans-serif`, for body text and controls. Declared weights 400–700.
- `Bricolage Grotesque`, falling back to `DM Sans, sans-serif`, for brand and headings. Declared weights 600–700.

The six size tokens are 12, 14, 16, 20, 28 and 44px (`--text-xs` through `--text-display`). Regular copy uses 400, headings and controls use 600, and the first leaderboard rank uses 700. The headline is 44px on a wide screen and 28px when the layout contracts. Chapter titles are 28px on desktop and 20px on mobile.

Headings have a 1.15 line height and balanced wrapping; display tracking is −0.045em, normal heading tracking −0.025em. Body text uses 1.5; paragraphs use 1.6; story prose uses 1.7 on desktop and 1.55 on mobile. The story measure is capped at 70ch. Mobile inputs use 16px. Counts and timers use tabular numerals. Transaction hashes and contract addresses wrap in full; wallet and table addresses have standard short labels linking to their full explorer records.

Both fonts were observed loaded in Chromium. Font licensing is preserved under `artifacts/licenses/`.

## Layout

The spacing tokens are 4, 8, 12, 16, 24, 32, 48 and 64px. Shared gaps and padding reuse these tokens; local 18, 20 and 28px values refine the scene and grid.

`main` is at most 1184px wide. The main game and leaderboard use an asymmetric grid: flexible story/content column, 340px utility column and 28px gap. At 1280px and below, page margins become 32px and the utility column 320px. At 1030px they become 24px and 300px; at 820px the utility column is 278px and navigation hides.

At 680px and below, the game becomes one column with 20px page margins. The scene is 164px high. The chapter, path choices and action precede the compact round status. Choice descriptions and the desktop mode switch hide; the practice action and its “Back to live” notice retain the full play loop. The journal becomes an icon control over the scene. The leaderboard and reward panel stack.

At 370px and below, margins become 16px, the scene is 160px and the headline can wrap. At 1500px and above, the main top inset grows to 40px. Screens were checked at 320, 390, 768 and 1440px with no horizontal overflow. At 390 × 844 the complete primary action was visible. Narrow-screen reflow is not a claim of native 200% browser zoom testing.

## Elevation & Depth

The interface is flat. A 1px structural border outlines the story; choices use borders to show their selectable state. The rewards panel uses a sage surface without a shadow. There are no nested decorative cards.

Only native dialogs use elevation: `0 20px 80px #302a2230`, without a border. Their backdrop is `#302a2259` with a 4px blur. At mobile widths dialogs align to the bottom and account for the safe-area inset. The art crops inside its own rounded scene; prose and transaction values are never clipped to fit.

## Shapes

The reusable radii are 8px for buttons and compact controls, 12px for choices and the mobile story, 20px for desktop story/reward surfaces and dialogs, and 100px for location tags. The desktop scene’s upper corners are 19px inside its 1px, 20px outer frame. Mobile scene corners are 11px inside a 12px frame.

Icons are a single original outline set in `src/components/Icon.tsx`, normally 20px with a 1.7px stroke and `currentColor`. Decorative icons are hidden from assistive technology. Wallet marks retain the vendors’ original colors.

## Components

| Component / pattern      | Source                                                               | Use and states                                                                                                                                           |
| ------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buttons                  | `src/style.css`, `.button`, `.primary`, `.secondary`, `.text-button` | One terracotta primary action for the story. Rest, hover, pressed, disabled and visible keyboard focus.                                                  |
| Story panel              | `src/App.tsx`, `.story-panel`, `.chapter-content`                    | Verified round, mood, local illustration and authored chapter. Practice is labeled separately. Loading/error states never invent a settlement.           |
| Branch chooser           | `src/components/VotePanel.tsx`                                       | Native radio group with full-row labels, selected ring/background, keyboard arrow navigation, preparing wallet, pending, voted, paused and error states. |
| Wallet control and sheet | `src/components/Wallet.tsx`                                          | EIP-6963 names/icons, Coinbase Wallet, four mobile app links, network switch and disconnect. Pending/rejected connection states recover inline.          |
| Native modal             | `src/components/Modal.tsx`                                           | `showModal()` traps focus and makes the background inert. Close by Escape, backdrop or named close button. Browser focus returns to the trigger.         |
| Round status             | `src/App.tsx`, `.round-status`                                       | Block-clock-derived measurement countdown, labeled progress and separate settlement state. The clock alone never creates a chapter.                      |
| Leaderboard              | `src/components/Leaderboard.tsx`                                     | UTC date controls, semantic table, empty/unavailable/loading states, real contract ranks and current-wallet marker.                                      |
| Reward panel             | `src/components/Leaderboard.tsx`                                     | Exact rank schedule, provisional vs closed-day reward, claimed, ineligible and insufficient-pool states.                                                 |
| Transaction status       | `src/components/TransactionStatus.tsx`, `src/lib/transaction.ts`     | Signature, confirming, confirmed, failed and unknown states; full explorer hash. Vote statuses name the round; claim statuses name the UTC date.         |
| Launch/funding utility   | `src/components/Setup.tsx`                                           | Address validation, wallet deployment with 0.0055 ETH, code verification, configuration download and pool top-up.                                        |

CSS transitions last 150ms with `cubic-bezier(.2,0,0,1)` and name their properties. Button press scale is 0.96. Reduced motion removes transitions and scale and restores automatic scrolling. There are no looping animations. Focus uses a 2px cocoa outline with a 4px offset; radios extend it to the full label. Forced colors uses system `Highlight`.

## Do’s and Don’ts

- Start another surface with the current grid, semantic colors, type scale and native controls.
- Keep the story and one clear action ahead of supporting explanation on mobile.
- Use real contract state for ranks, balances, votes and claims. Keep practice explicitly labeled.
- Keep transaction context and full hashes readable across date and round changes.
- Keep illustrations local and preserve the art’s quiet sage/cream palette.
- Reuse native dialogs and the wallet sheet rather than adding another connection system.
- Keep empty states truthful. Do not seed fictional leaderboard entries or advance live chapters on a timer.
- Do not add a second font system, decorative card stack, persistent animation or another filled primary action.

To add a page-like utility, reuse `Modal`, a descriptive heading and the existing field/button patterns. Keep navigation as anchors or hash-based views so the static export needs no server rewrites. Check its keyboard path, 320px reflow, transaction state if applicable, and metadata before rebuilding.
