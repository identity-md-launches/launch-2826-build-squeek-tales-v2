import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const roots = [
  "src",
  "public",
  "dist",
  "contracts",
  "scripts",
  "artifacts",
  "README.md",
  "DESIGN.md",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "index.html",
  ".gitignore",
  "THIRD_PARTY.md",
];
const files = [];
function walk(file) {
  if (!fs.existsSync(file)) return;
  const stat = fs.lstatSync(file);
  assert(
    !stat.isSymbolicLink(),
    `Submission must contain no dependency symlink: ${file}`,
  );
  if (stat.isDirectory()) {
    assert(
      !["node_modules", ".cache", ".vite", "vendor", "coverage"].includes(
        path.basename(file),
      ),
      `Generated packaging directory: ${file}`,
    );
    for (const child of fs.readdirSync(file)) walk(path.join(file, child));
  } else {
    assert(
      !/\.(tgz|deb|zip|map)$/.test(file),
      `Unnecessary packaging artifact: ${file}`,
    );
    files.push({ path: file, bytes: stat.size });
  }
}
roots.forEach(walk);
for (const required of [
  "dist/index.html",
  "public/share-card.png",
  "dist/share-card.png",
  "README.md",
  "DESIGN.md",
  "package-lock.json",
  "src/generated/SqueekTales.json",
])
  assert(
    files.some((f) => f.path === required),
    `Missing deliverable: ${required}`,
  );
const total = files.reduce((n, f) => n + f.bytes, 0);
assert(total <= 8_388_608, `Bundle ${total} exceeds 8 MiB`);
const html = fs.readFileSync("dist/index.html", "utf8");
for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const url = match[1];
  assert(
    !url.startsWith("/") && !/^https?:/.test(url),
    `Export asset must be relative: ${url}`,
  );
  const file = path.join("dist", url);
  assert(fs.existsSync(file), `Missing export asset: ${url}`);
}
for (const css of files.filter(
  (f) => f.path.startsWith("dist/assets/") && f.path.endsWith(".css"),
)) {
  for (const match of fs
    .readFileSync(css.path, "utf8")
    .matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    const url = match[1];
    if (url.startsWith("data:")) continue;
    assert(
      !url.startsWith("/") && !/^https?:/.test(url),
      `Font must be bundled locally: ${url}`,
    );
    assert(
      fs.existsSync(path.resolve(path.dirname(css.path), url)),
      `Missing CSS asset ${url}`,
    );
  }
}
const grouped = Object.fromEntries(
  roots.map((root) => [
    root,
    files
      .filter((f) => f.path === root || f.path.startsWith(root + "/"))
      .reduce((n, f) => n + f.bytes, 0),
  ]),
);
const caps = {
  dist: 2_097_152,
  public: 524_288,
  src: 524_288,
  contracts: 65_536,
  scripts: 262_144,
  artifacts: 2_097_152,
};
for (const [root, limit] of Object.entries(caps))
  assert(grouped[root] <= limit, `${root} exceeds documented path budget`);
const rootBytes = roots
  .filter((root) => !(root in caps))
  .reduce((sum, root) => sum + grouped[root], 0);
assert(
  rootBytes <= 1_048_576,
  "Root files exceed their documented path budget",
);
console.log(
  JSON.stringify(
    {
      limitBytes: 8_388_608,
      totalBytes: total,
      remainingBytes: 8_388_608 - total,
      fileCount: files.length,
      pathBytes: grouped,
      relativeAssets: "passed",
      dependencyArchives: "none",
    },
    null,
    2,
  ),
);
