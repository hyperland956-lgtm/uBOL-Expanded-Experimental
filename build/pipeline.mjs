import fs   from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT      = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const UBLOCK    = path.join(ROOT, 'ublock-src');
const PATCHES   = path.join(ROOT, 'patches');
const OVERRIDES = JSON.parse(fs.readFileSync(path.join(PATCHES, 'filter-overrides.json'), 'utf8'));
const FILTERS   = JSON.parse(fs.readFileSync(path.join(ROOT, 'extra-filters.json'), 'utf8'));

const PLATFORMS = [
  { id: 'chromium', baseDir: path.join(ROOT, 'chromium'), outDir: path.join(ROOT, 'output-chromium') },
  { id: 'firefox',  baseDir: path.join(ROOT, 'firefox'),  outDir: path.join(ROOT, 'output-firefox')  },
];

const WORKSPACE = path.join(ROOT, 'build-workspace');
const MV3_DATA  = path.join(ROOT, 'mv3-data');

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

function cleanDirs() {
  for (const dir of [WORKSPACE, MV3_DATA, ...PLATFORMS.map(p => p.outDir)]) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }
}

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
  if (fs.existsSync(regexAnalyzer)) copyFileSync(regexAnalyzer, path.join(WORKSPACE, 'js', 'offscreen', 'regex-analyzer.js'));
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

function writeRulesetsJson() {
  const rulesets = FILTERS.map(f => ({
    id: f.id, name: f.name, group: f.group, enabled: f.enabled,
    tags: f.tags, urls: [f.url], homeURL: f.homeURL,
  }));
  fs.writeFileSync(path.join(WORKSPACE, 'rulesets.json'), JSON.stringify(rulesets, null, 2));
}

function populateCache() {
  const cacheDir = path.join(ROOT, 'cache');
  for (const f of FILTERS) {
    const localPath = path.join(ROOT, f.cacheFile);
    if (!fs.existsSync(localPath)) throw new Error(`Cache file not found: ${localPath}`);
    fs.copyFileSync(localPath, path.join(MV3_DATA, urlToCacheFilename(f.url)));
  }
}

// Compile AdGuard rulesets once — output goes to a temp dir, then we distribute per-platform
function runConverter() {
  const tmpOut = path.join(ROOT, 'output-chromium-tmp');
  if (fs.existsSync(tmpOut)) fs.rmSync(tmpOut, { recursive: true, force: true });
  // Use chromium as the compile target (DNR format is the same for chromium/edge/firefox mv3)
  copyDirSync(PLATFORMS[0].baseDir, tmpOut);
  execSync(
    `node --no-warnings make-rulesets.js output="${tmpOut}" platform=chromium`,
    { cwd: WORKSPACE, stdio: 'inherit' }
  );
  return tmpOut;
}

// Merge compiled AdGuard rulesets into a platform's extension output
function mergePlatform(platform, compiledTmpDir) {
  copyDirSync(platform.baseDir, platform.outDir);

  // Copy compiled AdGuard ruleset files (main/, scripting/, etc.)
  const rulesetsDir = path.join(compiledTmpDir, 'rulesets');
  const outRulesetsDir = path.join(platform.outDir, 'rulesets');
  if (fs.existsSync(rulesetsDir)) {
    for (const entry of fs.readdirSync(rulesetsDir, { withFileTypes: true })) {
      const src = path.join(rulesetsDir, entry.name);
      const dest = path.join(outRulesetsDir, entry.name);
      if (entry.isDirectory()) {
        for (const f of fs.readdirSync(src)) {
          const fname = path.join(src, f);
          const fdest = path.join(dest, f);
          const isOurs = FILTERS.some(fil => f.startsWith(fil.id));
          if (isOurs) copyFileSync(fname, fdest);
        }
      }
    }
  }

  // Merge ruleset-details.json
  const baseDetailsPath = path.join(platform.baseDir, 'rulesets', 'ruleset-details.json');
  const newDetailsPath  = path.join(compiledTmpDir, 'rulesets', 'ruleset-details.json');
  const outDetailsPath  = path.join(platform.outDir, 'rulesets', 'ruleset-details.json');
  if (fs.existsSync(baseDetailsPath) && fs.existsSync(newDetailsPath)) {
    const baseDetails = JSON.parse(fs.readFileSync(baseDetailsPath, 'utf8'));
    const newDetails  = JSON.parse(fs.readFileSync(newDetailsPath, 'utf8'));
    // Apply group overrides to existing rulesets
    const { groupOverrides } = OVERRIDES;
    const mergedDetails = baseDetails.map(d =>
      groupOverrides[d.id] ? { ...d, ...groupOverrides[d.id] } : d
    );
    // Append our new AdGuard entries, applying group/parent/enabled from extra-filters.json
    const seenIds = new Set(mergedDetails.map(d => d.id));
    for (const d of newDetails) {
      if (seenIds.has(d.id)) continue;
      const cfg = FILTERS.find(f => f.id === d.id);
      if (cfg) {
        d.group   = cfg.group;
        d.enabled = cfg.enabled;
        if (cfg.parent !== undefined) d.parent = cfg.parent;
      }
      mergedDetails.push(d);
    }
    fs.writeFileSync(outDetailsPath, JSON.stringify(mergedDetails, null, 2) + '\n');
  }

  // Merge manifest rule_resources
  const baseManifest = JSON.parse(fs.readFileSync(path.join(platform.baseDir, 'manifest.json'), 'utf8'));
  const newManifest  = JSON.parse(fs.readFileSync(path.join(compiledTmpDir, 'manifest.json'), 'utf8'));
  const baseRulesets = baseManifest.declarative_net_request?.rule_resources ?? [];
  const ourRulesets  = newManifest.declarative_net_request?.rule_resources ?? [];
  const seen = new Set(baseRulesets.map(r => r.id));
  newManifest.declarative_net_request.rule_resources = [
    ...baseRulesets,
    ...ourRulesets.filter(r => !seen.has(r.id)),
  ];
  fs.writeFileSync(path.join(platform.outDir, 'manifest.json'), JSON.stringify(newManifest, null, 2) + '\n');

  // Strip debug rulesets — they exceed AMO's 5 MB file size limit and are dev-only
  const debugDir = path.join(platform.outDir, 'rulesets', 'debug');
  if (fs.existsSync(debugDir)) fs.rmSync(debugDir, { recursive: true, force: true });

  // Strip oversized individual ruleset files that breach AMO's 5 MB linter limit.
  // The DNR engine reads the compiled binary rulesets, not these JSON files at runtime.
  const oversizedFiles = ['adguard-tracking-extra.json'];
  for (const fname of oversizedFiles) {
    const fp = path.join(platform.outDir, 'rulesets', 'main', fname);
    if (fs.existsSync(fp)) fs.rmSync(fp);
  }
}

// Apply patches/ directory onto an extension output dir.
// Special file handling conventions:
//   *.patch.json        → keys merged into matching *.json (original wins on missing keys)
//   *.inject-after.js   → content appended to matching js/* file in outDir
//   css/*.css           → copied + <link> auto-injected into popup.html
//   js/ruleset-exclusive.js → __EXCLUSIVE_PAIRS__ token replaced, <script> injected into dashboard.html
//   welcome.html        → copied + added to manifest web_accessible_resources
//   icons/              → reference-only folder, skipped
function applyPatches(outDir, platformId) {
  const exclusivePairsJson = JSON.stringify(OVERRIDES.exclusivePairs);

  function applyPatchJson(src, targetPath) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const original = fs.existsSync(targetPath) ? JSON.parse(fs.readFileSync(targetPath, 'utf8')) : {};
    const patch    = JSON.parse(fs.readFileSync(src, 'utf8'));
    fs.writeFileSync(targetPath, JSON.stringify({ ...original, ...patch }, null, 2) + '\n');
  }

  function processDir(srcDir, destDir, relDir = '') {
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
      const src     = path.join(srcDir, entry.name);
      const dest    = path.join(destDir, entry.name);
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (entry.name === 'icons') {
          // Copy custom icons into the extension's img/ directory
          const imgDest = path.join(outDir, 'img');
          fs.mkdirSync(imgDest, { recursive: true });
          for (const f of fs.readdirSync(src)) {
            fs.copyFileSync(path.join(src, f), path.join(imgDest, f));
          }
          continue;
        }
        // Skip platform-specific folders meant for the other platform
        if (entry.name === 'firefox' || entry.name === 'chromium') continue;
        processDir(src, dest, relPath);
        continue;
      }

      // firefox-manifest.patch.json only applies to the firefox output
      if (entry.name === 'firefox-manifest.patch.json') {
        if (platformId === 'firefox') {
          applyPatchJson(src, path.join(outDir, 'manifest.json'));
        }
        continue;
      }

      // *.patch.json → merge into matching *.json
      if (entry.name.endsWith('.patch.json')) {
        applyPatchJson(src, dest.replace(/\.patch\.json$/, '.json'));
        continue;
      }

      // *.inject-after.js → append to matching js file in outDir
      if (entry.name.endsWith('.inject-after.js')) {
        const baseName  = entry.name.replace('.inject-after.js', '.js');
        const targetJs  = path.join(outDir, 'js', baseName);
        if (fs.existsSync(targetJs)) {
          fs.appendFileSync(targetJs, '\n' + fs.readFileSync(src, 'utf8'));
        }
        continue;
      }

      fs.mkdirSync(destDir, { recursive: true });

      // css/*.css → copy + inject <link> into popup.html
      if (relDir === 'css' && entry.name.endsWith('.css')) {
        fs.copyFileSync(src, dest);
        const popupPath = path.join(outDir, 'popup.html');
        if (fs.existsSync(popupPath)) {
          let popup = fs.readFileSync(popupPath, 'utf8');
          const tag = `<link rel="stylesheet" href="css/${entry.name}">`;
          if (!popup.includes(tag)) {
            popup = popup.replace('</head>', `${tag}\n</head>`);
            fs.writeFileSync(popupPath, popup);
          }
        }
        continue;
      }

      // js/ruleset-exclusive.js → replace token + inject <script> into dashboard.html
      if (entry.name === 'ruleset-exclusive.js') {
        const content = fs.readFileSync(src, 'utf8').replace('__EXCLUSIVE_PAIRS__', exclusivePairsJson);
        fs.writeFileSync(dest, content);
        const dashPath = path.join(outDir, 'dashboard.html');
        if (fs.existsSync(dashPath)) {
          let dash = fs.readFileSync(dashPath, 'utf8');
          if (!dash.includes('ruleset-exclusive.js')) {
            dash = dash.replace('</body>', '<script src="js/ruleset-exclusive.js"></script>\n</body>');
            fs.writeFileSync(dashPath, dash);
          }
        }
        continue;
      }

      // welcome.html → copy + register in manifest web_accessible_resources
      if (entry.name === 'welcome.html') {
        fs.copyFileSync(src, dest);
        const manifestPath = path.join(outDir, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          const war = manifest.web_accessible_resources ?? [];
          const already = war.some(e => (e.resources ?? []).includes('welcome.html'));
          if (!already) {
            war.push({ resources: ['welcome.html'], matches: ['<all_urls>'] });
            manifest.web_accessible_resources = war;
            fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
          }
        }
        continue;
      }

      fs.copyFileSync(src, dest);
    }
  }

  processDir(PATCHES, outDir);
}

function summary(compiledTmpDir) {
  const detailsPath = path.join(compiledTmpDir, 'rulesets', 'ruleset-details.json');
  if (!fs.existsSync(detailsPath)) return;
  const details = JSON.parse(fs.readFileSync(detailsPath, 'utf8'));
  console.log('\nBuild complete — uBOL-Expanded');
  for (const d of details) {
    const accepted = d.filters?.accepted?.toLocaleString() ?? '?';
    const rules = ((d.rules?.plain ?? 0) + (d.rules?.regex ?? 0)).toLocaleString();
    console.log(`  ${d.id}: ${accepted} filters → ${rules} DNR rules`);
  }
}

// rewrite extName in EVERY locale's messages.json.

function rebrandAllLocales(outDir) {
  const localesDir = path.join(outDir, '_locales');
  if (!fs.existsSync(localesDir)) return;

  const NEW_NAME = 'uBOL Expanded';

  for (const locale of fs.readdirSync(localesDir)) {
    const msgPath = path.join(localesDir, locale, 'messages.json');
    if (!fs.existsSync(msgPath)) continue;

    const msgs = JSON.parse(fs.readFileSync(msgPath, 'utf8'));
    if (msgs.extName && msgs.extName.message) {
      msgs.extName.message = NEW_NAME;
    }
    fs.writeFileSync(msgPath, JSON.stringify(msgs, null, 2) + '\n');
  }
  console.log(`  Rebranded extName → "${NEW_NAME}" in all locales`);
}

async function main() {
  console.log('uBOL-Expanded pipeline starting...\n');
  cleanDirs();
  stageWorkspace();
  writeRulesetsJson();
  populateCache();

  const compiledTmpDir = runConverter();

  for (const platform of PLATFORMS) {
    console.log(`\nMerging platform: ${platform.id}`);
    if (!fs.existsSync(platform.baseDir)) {
      console.log(`  Skipping — base dir not found: ${platform.baseDir}`);
      continue;
    }
    mergePlatform(platform, compiledTmpDir);
    applyPatches(platform.outDir, platform.id);
    rebrandAllLocales(platform.outDir);
  }

  summary(compiledTmpDir);
  fs.rmSync(compiledTmpDir, { recursive: true, force: true });
}

main().catch(err => { console.error(err); process.exit(1); });
