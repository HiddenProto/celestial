#!/usr/bin/env node
/**
 * build.js — sync proxy dist files from node_modules to their public dirs.
 * Run with:  node build.js
 *
 * Packages managed:
 *   @mercuryworkshop/scramjet   → sj/
 *   @mercuryworkshop/bare-mux  → mux/
 *   @mercuryworkshop/epoxy-tls → epoxy/
 *   @titaniumnetwork-dev/ultraviolet → violet/  (renamed uv.* → violet.*)
 */

import { copyFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const nm = (pkg) => join(__dirname, "node_modules", pkg);
const out = (dir) => join(__dirname, dir);

function cp(src, dst) {
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  console.log(`  ✓  ${dst.replace(__dirname, ".")}`);
}

function section(name) {
  console.log(`\n── ${name} ─────────────────────`);
}

// ── Scramjet ──────────────────────────────────────────────────
// NOTE: scramjet in sj/ is VENDORED at v2.0.0-alpha (the build celestial.press
// runs) and committed directly — do NOT copy from node_modules here, or the
// older npm v1 would clobber it. Leave sj/ as-is.
section("scramjet → sj/ (vendored v2, skipped)");
console.log("  ·  using committed sj/ files (scramjet v2.0.0-alpha)");

// ── bare-mux ──────────────────────────────────────────────────
section("@mercuryworkshop/bare-mux → mux/");
const muxSrc = join(nm("@mercuryworkshop/bare-mux"), "dist");
cp(join(muxSrc, "index.mjs"),       out("mux/index.mjs"));
cp(join(muxSrc, "index.mjs.map"),   out("mux/index.mjs.map"));
cp(join(muxSrc, "worker.js"),       out("mux/worker.js"));
cp(join(muxSrc, "worker.js.map"),   out("mux/worker.js.map"));

// ── epoxy-tls ─────────────────────────────────────────────────
section("@mercuryworkshop/epoxy-tls → epoxy/");
const epxSrc = join(nm("@mercuryworkshop/epoxy-tls"), "full");
cp(join(epxSrc, "epoxy-bundled.js"), out("epoxy/index.mjs"));
cp(join(epxSrc, "epoxy.wasm"),       out("epoxy/epoxy.wasm"));

// ── Ultraviolet (as violet/) ───────────────────────────────────
section("@titaniumnetwork-dev/ultraviolet → violet/");
const uvSrc = join(nm("@titaniumnetwork-dev/ultraviolet"), "dist");
cp(join(uvSrc, "uv.bundle.js"),     out("violet/violet.bundle.js"));
cp(join(uvSrc, "uv.bundle.js.map"), out("violet/violet.bundle.js.map"));
cp(join(uvSrc, "uv.handler.js"),    out("violet/violet.handler.js"));
cp(join(uvSrc, "uv.handler.js.map"),out("violet/violet.handler.js.map"));
cp(join(uvSrc, "uv.client.js"),     out("violet/violet.client.js"));
cp(join(uvSrc, "uv.client.js.map"), out("violet/violet.client.js.map"));
cp(join(uvSrc, "uv.sw.js"),         out("violet/violet.sw.js"));
cp(join(uvSrc, "uv.sw.js.map"),     out("violet/violet.sw.js.map"));

console.log("\n✅  Build complete.\n");
