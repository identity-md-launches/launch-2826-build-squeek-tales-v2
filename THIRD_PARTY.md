# Sources and attribution

The hamster scene and favicon in `public/` are original SVG artwork made for Squeek Tales. The story passages are authored fiction. They describe the game, not observations of the hamster beyond the settled work classification.

The two bundled variable Latin fonts come from Google Fonts via Fontsource: DM Sans by Colophon Foundry and Bricolage Grotesque by Mathieu Triay. Their SIL Open Font License texts are in `artifacts/licenses/`.

Wallet marks are the MetaMask, Rabby, Phantom and Coinbase SVGs shipped in RainbowKit 2.2.11, MIT, copyright Rainbow. Their colors and geometry are retained. The generic browser-window icon is original. Runtime library and asset license texts are also preserved in `public/THIRD-PARTY-LICENSES.txt` and the export. Dependency versions and source distributions are recorded in `package-lock.json`.

Design guidance was adapted from Jakub Krehel’s Better Interface, MIT, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`, and the documentation method from Paul Bakaus’s Impeccable, Apache-2.0, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`. Both license texts are preserved in `artifacts/licenses/Interface-guides-LICENSE.txt`. The documentation adaptation is based on https://github.com/pbakaus/impeccable/blob/9d715cc4f5564a990ca8345abfdd5df6dc9b41c8/skill/reference/document.md. This records distinct works, not a relicensing of either.

SqueekCore’s read ABI is the subset of the published ABI needed for verification and certified history: https://docs.squeekchain.com/assets/abi/SqueekCore.json. Integration semantics were checked against https://docs.squeekchain.com/developers/core/, https://docs.squeekchain.com/developers/api/ and https://docs.squeekchain.com/system/rounds-and-blocks/ on 2026-11-01. Squeekchain names remain their owners’ marks. This is an independent game integration.

Mobile links follow the wallet vendor documentation linked in the pinned connector reference. Rabby’s current `_cmd=open-dapp&dapp=` route was checked in its own source: https://github.com/RabbyHub/rabby-mobile/blob/develop/apps/mobile/src/hooks/universalLink.ts and https://github.com/RabbyHub/rabby-mobile/blob/develop/apps/mobile/src/constant/universalLink.ts. Real app handoff still needs testing on physical phones.
