/**
 * uBOL-Expanded build pipeline
 *
 * Reads adguard-filters.json, stages ublock-src converter tools,
 * compiles AdGuard filter lists, then injects the compiled rulesets
 * into the base uBOL chromium extension (from this repo's chromium/ dir).
 *
 * The base rulesets (easylist, easyprivacy, etc.) are PRESERVED.
 * AdGuard rulesets are APPENDED on top.
 *
 * Patches from patches/ are applied last.
 */

import fs   from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT      = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const UBLOCK    = path.join(ROOT, 'ublock-src');
const BASE_EXT  = path.join(ROOT, 'chromium');
const WORKSPACE = path.join(ROOT, 'build-workspace');
const MV3_DATA  = path.join(ROOT, 'mv3-data');
const EXT_OUT   = path.join(ROOT, 'extension-output');
const PATCHES   = path.join(ROOT, 'patches');
const FILTERS   = JSON.parse(fs.readFileSync(path.join(ROOT, 'adguard-filters.json'), 'utf8'));

function copyFileSync(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    entry.isDirectory() ? copyDirSync(s, d) : fs.copyFileSync(s, d);
  }
}

function urlToCacheFilename(url) {
  return url.replace(/^https?:\/\//, '').replace(/\//g, '_');
}

// Step 1 — clean output directories
function cleanDirs() {
  for (const dir of [WORKSPACE, MV3_DATA, EXT_OUT]) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Step 2 — stage uBlock converter dependencies into WORKSPACE
function stageWorkspace() {
  const SRC = path.join(UBLOCK, 'src');
  const MV3 = path.join(UBLOCK, 'platform', 'mv3');

  const jsFiles = [
    'arglist-parser.js', 'base64-custom.js', 'biditrie.js',
    'dynamic-net-filtering.js', 'filtering-context.js', 'hnswitches.js',
    'hntrie.js', 'jsonpath.js', 'redirect-resources.js', 'regex-analyzer.js',
    's14e-serializer.js', 'static-dnr-filtering.js', 'static-filtering-parser.js',
    'static-net-filtering.js', 'static-filtering-io.js', 'tasks.js',
    'text-utils.js', 'urlskip.js', 'uri-utils.js', 'url-net-filtering.js',
  ];
  for (const f of jsFiles) {
    const src = path.join(SRC, 'js', f);
    if (fs.existsSync(src)) copyFileSync(src, path.join(WORKSPACE, 'js', f));
  }

  for (const lib of ['csstree', 'regexanalyzer', 'publicsuffixlist']) {
    const src = path.join(SRC, 'lib', lib);
    if (fs.existsSync(src)) copyDirSync(src, path.join(WORKSPACE, 'lib', lib));
  }
  const punycode = path.join(SRC, 'lib', 'punycode.js');
  if (fs.existsSync(punycode)) copyFileSync(punycode, path.join(WORKSPACE, 'lib', 'punycode.js'));

  const wasmDir = path.join(SRC, 'js', 'wasm');
  if (fs.existsSync(wasmDir)) copyDirSync(wasmDir, path.join(WORKSPACE, 'js', 'wasm'));

  for (const [wasmFile, outFile] of [
    ['hntrie.wasm',   'js/wasm/hntrie.wasm.json'],
    ['biditrie.wasm', 'js/wasm/biditrie.wasm.json'],
  ]) {
    const p = path.join(SRC, 'js', 'wasm', wasmFile);
    if (fs.existsSync(p)) {
      fs.writeFileSync(path.join(WORKSPACE, outFile), JSON.stringify(Array.from(fs.readFileSync(p))));
    }
  }
  const pslWasm = path.join(SRC, 'lib', 'publicsuffixlist', 'wasm', 'publicsuffixlist.wasm');
  if (fs.existsSync(pslWasm)) {
    fs.writeFileSync(
      path.join(WORKSPACE, 'lib', 'publicsuffixlist', 'wasm', 'publicsuffixlist.wasm.json'),
      JSON.stringify(Array.from(fs.readFileSync(pslWasm)))
    );
  }

  const nodejsDir = path.join(UBLOCK, 'platform', 'nodejs');
  if (fs.existsSync(nodejsDir)) {
    for (const f of fs.readdirSync(nodejsDir)) {
      if (f.endsWith('.js')) copyFileSync(path.join(nodejsDir, f), path.join(WORKSPACE, f));
    }
  }

  for (const f of ['make-rulesets.js', 'salvage-ruleids.mjs', 'package.json']) {
    const src = path.join(MV3, f);
    if (fs.existsSync(src)) copyFileSync(src, path.join(WORKSPACE, f));
  }

  const offscreenSrc = path.join(MV3, 'extension', 'js', 'offscreen');
  if (fs.existsSync(offscreenSrc)) copyDirSync(offscreenSrc, path.join(WORKSPACE, 'js', 'offscreen'));

  const regexAnalyzer = path.join(SRC, 'js', 'regex-analyzer.js');
  if (fs.existsSync(regexAnalyzer)) {
    copyFileSync(regexAnalyzer, path.join(WORKSPACE, 'js', 'offscreen', 'regex-analyzer.js'));
  }

  const utilsSrc = path.join(MV3, 'extension', 'js', 'utils.js');
  if (fs.existsSync(utilsSrc)) copyFileSync(utilsSrc, path.join(WORKSPACE, 'js', 'utils.js'));

  const resourcesSrc = path.join(SRC, 'js', 'resources');
  if (fs.existsSync(resourcesSrc)) copyDirSync(resourcesSrc, path.join(WORKSPACE, 'js', 'resources'));

  const regexLib = path.join(SRC, 'lib', 'regexanalyzer');
  if (fs.existsSync(regexLib)) copyDirSync(regexLib, path.join(WORKSPACE, 'js', 'regexanalyzer'));

  const scriptletsSrc = path.join(MV3, 'scriptlets');
  if (fs.existsSync(scriptletsSrc)) copyDirSync(scriptletsSrc, path.join(WORKSPACE, 'scriptlets'));

  const warSrc = path.join(SRC, 'web_accessible_resources');
  if (fs.existsSync(warSrc)) copyDirSync(warSrc, path.join(WORKSPACE, 'web_accessible_resources'));

  const chromiumPlatform = path.join(MV3, 'chromium');
  if (fs.existsSync(chromiumPlatform)) copyDirSync(chromiumPlatform, path.join(WORKSPACE, 'chromium'));
}

// Step 3 — write rulesets.json for make-rulesets.js
function writeRulesetsJson() {
  const rulesets = FILTERS.map(f => ({
    id:      f.id,
    name:    f.name,
    group:   f.group,
    enabled: f.enabled,
    tags:    f.tags,
    urls:    [ f.url ],
    homeURL: f.homeURL,
  }));
  fs.writeFileSync(path.join(WORKSPACE, 'rulesets.json'), JSON.stringify(rulesets, null, 2));
}

// Step 4 — populate mv3-data cache from local filter files
function populateCache() {
  for (const f of FILTERS) {
    const localPath = path.join(ROOT, f.cacheFile);
    if (!fs.existsSync(localPath)) {
      throw new Error(`Filter cache file not found: ${localPath}`);
    }
    const cacheName = urlToCacheFilename(f.url);
    fs.copyFileSync(localPath, path.join(MV3_DATA, cacheName));
  }
}

// Step 5 — copy base uBOL extension (from fork's chromium/ dir)
function copyBaseExtension() {
  copyDirSync(BASE_EXT, EXT_OUT);
}

// Step 6 — run the official make-rulesets.js
function runConverter() {
  execSync(
    `node --no-warnings make-rulesets.js output="${EXT_OUT}" platform=chromium`,
    { cwd: WORKSPACE, stdio: 'inherit' }
  );
}

// Step 7 — merge manifests: restore base rulesets, append AdGuard ones
// make-rulesets.js replaces rule_resources entirely; we fix that here.
function mergeManifests() {
  const baseManifest = JSON.parse(fs.readFileSync(path.join(BASE_EXT, 'manifest.json'), 'utf8'));
  const newManifest  = JSON.parse(fs.readFileSync(path.join(EXT_OUT,  'manifest.json'), 'utf8'));

  const baseRulesets = baseManifest.declarative_net_request?.rule_resources ?? [];
  const ourRulesets  = newManifest.declarative_net_request?.rule_resources  ?? [];

  // Deduplicate by id in case of re-runs
  const seen = new Set(baseRulesets.map(r => r.id));
  const merged = [...baseRulesets, ...ourRulesets.filter(r => !seen.has(r.id))];

  newManifest.declarative_net_request.rule_resources = merged;
  fs.writeFileSync(path.join(EXT_OUT, 'manifest.json'), JSON.stringify(newManifest, null, 2) + '\n');

  // Also merge ruleset-details.json for the dashboard UI
  const baseDetailsPath = path.join(BASE_EXT, 'rulesets', 'ruleset-details.json');
  const newDetailsPath  = path.join(EXT_OUT,  'rulesets', 'ruleset-details.json');
  if (fs.existsSync(baseDetailsPath) && fs.existsSync(newDetailsPath)) {
    const baseDetails = JSON.parse(fs.readFileSync(baseDetailsPath, 'utf8'));
    const newDetails  = JSON.parse(fs.readFileSync(newDetailsPath,  'utf8'));
    const seenIds = new Set(baseDetails.map(d => d.id));
    const mergedDetails = [...baseDetails, ...newDetails.filter(d => !seenIds.has(d.id))];
    fs.writeFileSync(newDetailsPath, JSON.stringify(mergedDetails, null, 2) + '\n');
  }
}

// Step 8 — apply patches from patches/ (file overrides on top of extension-output/)
// To add a patch: drop the file into patches/ mirroring the extension folder structure.
// e.g. patches/_locales/en/messages.json  →  extension-output/_locales/en/messages.json
function applyPatches() {
  if (!fs.existsSync(PATCHES)) return;

  function applyDir(srcDir, destDir) {
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
      const src  = path.join(srcDir,  entry.name);
      const dest = path.join(destDir, entry.name);
      if (entry.isDirectory()) {
        // icons/ in patches is a reference folder, not applied to extension
        if (entry.name === 'icons') continue;
        applyDir(src, dest);
      } else {
        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(src, dest);
      }
    }
  }

  applyDir(PATCHES, EXT_OUT);
}

// Step 9 — print build summary
function summary() {
  const detailsPath = path.join(EXT_OUT, 'rulesets', 'ruleset-details.json');
  const details = fs.existsSync(detailsPath)
    ? JSON.parse(fs.readFileSync(detailsPath, 'utf8'))
    : [];
  const adguardDetails = details.filter(d => d.id.endsWith('-extra'));

  console.log('\nBuild complete — uBOL-Expanded');
  console.log(`Base rulesets: ${details.length - adguardDetails.length}`);
  console.log(`AdGuard rulesets added: ${adguardDetails.length}`);
  for (const d of adguardDetails) {
    console.log(`  ${d.id}: ${d.filters?.accepted?.toLocaleString()} filters → ${d.rules?.plain?.toLocaleString()} DNR rules`);
  }
  console.log(`\nOutput: ${EXT_OUT}`);
}

async function main() {
  console.log('uBOL-Expanded pipeline starting...\n');
  cleanDirs();
  stageWorkspace();
  writeRulesetsJson();
  populateCache();
  copyBaseExtension();
  runConverter();
  mergeManifests();
  applyPatches();
  summary();
}

main().catch(err => { console.error(err); process.exit(1); });
