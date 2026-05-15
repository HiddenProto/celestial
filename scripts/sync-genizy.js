/**
 * sync-genizy.js
 * Downloads new games from genizy/web-port into assets/src/ and
 * appends books.json entries for each one.
 *
 * Run: node scripts/sync-genizy.js
 *
 * What it does:
 *   1. Sparse-clones genizy/web-port (only the dirs we need — no full download)
 *   2. Copies each game dir into assets/src/
 *   3. Appends new entries to assets/json/books.json
 *   4. Cleans up the temp clone
 *
 * Safe to re-run: skips games already present in assets/src/
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "assets", "src");
const BOOKS = path.join(ROOT, "assets", "json", "books.json");
const TMP = path.join(ROOT, ".tmp-genizy");
const REPO = "https://github.com/genizy/web-port.git";

// ── Game definitions ──────────────────────────────────────────────────────────
// slug         = folder name in genizy repo
// name         = display name in books.json
// categories   = tag list for the filter UI
// type         = "exclusive" (port) or "regular"
// urlOverride  = relative path inside the slug dir if index.html is in a subdir
// img          = path under /assets/img/gms/ — add a thumbnail there to use it,
//                otherwise falls back to the generic placeholder
const GAMES = [
  { slug: "amanda-the-adventurer",    name: "Amanda the Adventurer",       categories: ["horror", "indie", "port"], type: "exclusive" },
  { slug: "andys-apple-farm",         name: "Andy's Apple Farm",           categories: ["horror", "indie", "port"], type: "exclusive" },
  { slug: "baldi-plus",               name: "Baldi's Basics Plus",         categories: ["horror", "indie", "port"], type: "exclusive" },
  { slug: "baldi-remaster",           name: "Baldi's Basics Remastered",   categories: ["horror", "indie", "port"], type: "exclusive" },
  { slug: "donottakethiscathome",     name: "Do Not Take This Cat Home",   categories: ["horror", "indie", "port"], type: "exclusive" },
  { slug: "fears-to-fathom",         name: "Fears to Fathom",             categories: ["horror", "indie", "port"], type: "exclusive", urlOverride: "home-alone/index.html" },
  { slug: "getting-over-it",          name: "Getting Over It",             categories: ["indie", "port"],           type: "exclusive" },
  { slug: "happy-sheepies",           name: "Happy Sheepies",              categories: ["indie"],                   type: "regular"   },
  { slug: "hotline-miami",            name: "Hotline Miami",               categories: ["indie", "port"],           type: "exclusive" },
  { slug: "human-expenditure-program",name: "Human Expenditure Program",   categories: ["horror", "rpg", "port"],   type: "exclusive" },
  { slug: "jelly-drift",              name: "Jelly Drift",                 categories: ["indie", "port"],           type: "exclusive" },
  { slug: "karlson",                  name: "Karlson",                     categories: ["indie", "port"],           type: "exclusive" },
  { slug: "lacysflashgames",          name: "Lacy's Flash Games",          categories: ["indie"],                   type: "regular"   },
  { slug: "milkman-karlson",          name: "Milkman Karlson",             categories: ["indie", "port"],           type: "exclusive" },
  { slug: "minesweeperplus",          name: "Minesweeper+",                categories: ["puzzle", "indie"],         type: "regular"   },
  { slug: "omori-fixed",              name: "OMORI",                       categories: ["rpg", "indie", "port"],    type: "exclusive" },
  { slug: "raft",                     name: "Raft",                        categories: ["indie", "port", "sandbox"],type: "exclusive" },
  { slug: "schoolboy-runaway",        name: "Schoolboy Runaway",           categories: ["indie", "port"],           type: "exclusive" },
  { slug: "sonic.exe",                name: "Sonic.exe",                   categories: ["horror", "indie", "port"], type: "exclusive" },
  { slug: "speed-stars",              name: "Speed Stars",                 categories: ["sports", "port"],          type: "exclusive" },
  { slug: "tattletail",               name: "Tattletail",                  categories: ["horror", "indie", "port"], type: "exclusive" },
  { slug: "thats-not-my-neighbor",    name: "That's Not My Neighbor",      categories: ["horror", "indie", "port"], type: "exclusive" },
  { slug: "the-man-in-the-window",    name: "The Man From The Window",     categories: ["horror", "indie", "port"], type: "exclusive" },
  { slug: "witch-heart",              name: "Witch Heart",                 categories: ["rpg", "indie", "port"],    type: "exclusive" },
  { slug: "yume-nikki",               name: "Yume Nikki",                  categories: ["rpg", "indie", "port"],    type: "exclusive" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { stdio: "inherit", ...opts });
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// ── Determine which games to skip (already in assets/src/) ───────────────────
const toDownload = GAMES.filter((g) => {
  const dest = path.join(SRC, g.slug);
  if (fs.existsSync(dest)) {
    console.log(`⏭  ${g.slug} already exists, skipping`);
    return false;
  }
  return true;
});

if (!toDownload.length) {
  console.log("All games already present. Nothing to do.");
  process.exit(0);
}

// ── Clone with sparse checkout ─────────────────────────────────────────────────
console.log(`\n── Cloning genizy/web-port (sparse) ──────────────────────`);
if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });

run(`git clone --no-checkout --filter=blob:none --sparse ${REPO} "${TMP}"`);

// Set which dirs to materialise
const slugs = toDownload.map((g) => g.slug);
run(`git -C "${TMP}" sparse-checkout set ${slugs.map(s => `"${s}"`).join(" ")}`);
run(`git -C "${TMP}" checkout`);

// ── Copy into assets/src/ ─────────────────────────────────────────────────────
console.log(`\n── Copying game files ────────────────────────────────────`);
const copied = [];
for (const g of toDownload) {
  const src = path.join(TMP, g.slug);
  const dst = path.join(SRC, g.slug);
  if (!fs.existsSync(src)) {
    console.warn(`  ⚠  ${g.slug} not found in clone, skipping`);
    continue;
  }
  console.log(`  ✓  ${g.slug} → assets/src/${g.slug}/`);
  copyDir(src, dst);
  copied.push(g);
}

// ── Cleanup temp clone ────────────────────────────────────────────────────────
console.log(`\n── Cleaning up temp clone ────────────────────────────────`);
fs.rmSync(TMP, { recursive: true, force: true });
console.log("  ✓  removed .tmp-genizy");

// ── Update books.json ─────────────────────────────────────────────────────────
console.log(`\n── Updating books.json ───────────────────────────────────`);
const books = JSON.parse(fs.readFileSync(BOOKS, "utf8"));
const existingNames = new Set(books.map((b) => b.name));
const PLACEHOLDER_IMG = "/assets/img/gms/boringasslogo.png";

let added = 0;
for (const g of copied) {
  if (existingNames.has(g.name)) {
    console.log(`  ⏭  "${g.name}" already in books.json`);
    continue;
  }
  const urlPath = g.urlOverride
    ? `${g.slug}/${g.urlOverride}`
    : `${g.slug}/index.html`;
  books.push({
    name: g.name,
    img: `/assets/img/gms/${g.slug}.png`,
    type: g.type,
    url: `/assets/src/${urlPath}`,
    categories: g.categories,
    source: "local",
  });
  console.log(`  ✓  added "${g.name}"`);
  added++;
}

fs.writeFileSync(BOOKS, JSON.stringify(books, null, 4), "utf8");

// ── Update localFallback for the-man-in-the-window in books.json ──────────────
// The proxied entry used a different local path guess — fix it to match the real slug
let fixedFallback = false;
for (const entry of books) {
  if (
    entry.localFallback &&
    entry.localFallback.includes("the-man-from-the-window")
  ) {
    entry.localFallback = "/assets/src/the-man-in-the-window/index.html";
    fixedFallback = true;
  }
}
if (fixedFallback) {
  fs.writeFileSync(BOOKS, JSON.stringify(books, null, 4), "utf8");
  console.log(`  ✓  fixed localFallback path for "The Man From The Window"`);
}

console.log(`\n✅  Done — ${copied.length} games downloaded, ${added} entries added to books.json`);
console.log(`   Add thumbnails to /assets/img/gms/{slug}.png to replace the placeholder.`);
console.log(`   Then: git add assets/src assets/json/books.json && git commit -m "feat: add genizy games" && git push`);
