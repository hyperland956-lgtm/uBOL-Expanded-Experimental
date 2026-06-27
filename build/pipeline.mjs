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

// Build version: set by CI via $VERSION env var, or fall back to manifest's existing version.
const BUILD_VERSION = process.env.VERSION || '';

function copyFileSync(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDirSync(src, dest, filter) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (filter && !filter(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    entry.isDirectory() ? copyDirSync(s, d, filter) : fs.copyFileSync(s, d);
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
  const EXCLUDE_FROM_OUTPUT = new Set(['README.md', 'log.txt', 'background.html', 'filter-overrides.json']);

  if (platform.id === 'firefox') {
    // Firefox gets the full Chromium output as its base.
    // Gorhill ships IDENTICAL JS (including js/offscreen/) to both platforms.
    // The ONLY difference between real Chromium and Firefox releases is manifest.json.
    const chromiumOut = PLATFORMS[0].outDir;
    copyDirSync(chromiumOut, platform.outDir);
  } else {
    // Chromium: copy from the sparse uBOL-home/chromium base
    copyDirSync(platform.baseDir, platform.outDir, (name) => !EXCLUDE_FROM_OUTPUT.has(name));
  }


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

  // Merge ruleset-details.json (Chromium only, Firefox inherits the completed one from Chromium)
  const baseDetailsPath = path.join(platform.baseDir, 'rulesets', 'ruleset-details.json');
  const newDetailsPath  = path.join(compiledTmpDir, 'rulesets', 'ruleset-details.json');
  const outDetailsPath  = path.join(platform.outDir, 'rulesets', 'ruleset-details.json');
  if (platform.id === 'chromium' && fs.existsSync(baseDetailsPath) && fs.existsSync(newDetailsPath)) {
    const baseDetails = JSON.parse(fs.readFileSync(baseDetailsPath, 'utf8'));
    const newDetails  = JSON.parse(fs.readFileSync(newDetailsPath, 'utf8'));
    // Apply group overrides to existing rulesets
    const { groupOverrides } = OVERRIDES;
    const mergedDetails = baseDetails.map(d => {
      if (!groupOverrides[d.id]) return d;
      const merged = { ...d, ...groupOverrides[d.id] };
      // group: null in overrides means "move to Miscellaneous" (UI checks group === undefined)
      if (merged.group === null) delete merged.group;
      return merged;
    });
    // Append our new AdGuard entries, applying group/parent/enabled from extra-filters.json
    const seenIds = new Set(mergedDetails.map(d => d.id));
    for (const d of newDetails) {
      if (seenIds.has(d.id)) continue;
      const cfg = FILTERS.find(f => f.id === d.id);
      if (cfg) {
        d.group   = cfg.group;
        d.enabled = cfg.enabled;
        if (cfg.parent !== undefined) d.parent = cfg.parent;
        if (cfg.info) d.info = cfg.info;
      }
      mergedDetails.push(d);
    }
    fs.writeFileSync(outDetailsPath, JSON.stringify(mergedDetails, null, 2) + '\n');
  }

  // Build the manifest for this platform.
  if (platform.id === 'firefox') {
    // Derive Firefox manifest FROM the completed Chromium output manifest.
    // The stale uBOL-home/firefox/manifest.json is not used — gorhill only differs
    // by a handful of keys between platforms, so we patch those surgically.
    const manifest = JSON.parse(fs.readFileSync(path.join(platform.outDir, 'manifest.json'), 'utf8'));

    // Switch background from service_worker to scripts (Firefox MV3)
    manifest.background = { scripts: ['/js/background.js'], type: 'module' };

    // Firefox uses host_permissions (granted at install), not optional_permissions.
    // Chromium may have <all_urls> in optional_permissions — move it to host_permissions.
    if (!manifest.host_permissions) manifest.host_permissions = [];
    if (manifest.optional_permissions) {
      const allUrls = manifest.optional_permissions.filter(p => p === '<all_urls>');
      const remaining = manifest.optional_permissions.filter(p => p !== '<all_urls>');
      if (allUrls.length > 0 && !manifest.host_permissions.includes('<all_urls>')) {
        manifest.host_permissions.push('<all_urls>');
      }
      if (remaining.length > 0) {
        manifest.optional_permissions = remaining;
      } else {
        delete manifest.optional_permissions;
      }
    }

    // options_ui: open in its own tab, not inline in about:addons
    manifest.options_ui = { open_in_tab: true, page: 'dashboard.html' };

    // Remove Chromium-only keys that Firefox doesn't support
    delete manifest.incognito;                  // Firefox doesn't support "split"
    if (manifest.permissions) {
      manifest.permissions = manifest.permissions.filter(
        p => p !== 'offscreen' && p !== 'userScripts'
      );
    }

    // web_accessible_resources: add HTML page entries matching real uBO Lite Firefox.
    // The Chromium manifest may be missing the separate HTML entries that Firefox needs
    // for strict-block, picker, zapper, and unpicker UI pages.
    // Also strip use_dynamic_url — it's Chrome-only; Firefox warns on it.
    const war = manifest.web_accessible_resources ?? [];
    const htmlPages = ['/strictblock.html', '/zapper-ui.html', '/picker-ui.html', '/unpicker-ui.html'];
    for (const page of htmlPages) {
      const already = war.some(e => (e.resources ?? []).includes(page));
      if (!already) {
        war.unshift({ resources: [page], matches: ['<all_urls>'] });
      }
    }
    // Remove Chrome-only use_dynamic_url from every WAR entry
    manifest.web_accessible_resources = war.map(e => {
      const { use_dynamic_url, ...rest } = e;
      return rest;
    });

    // Remove top-level 'storage' key (Chrome managed-storage schema — Firefox warns on it)
    delete manifest.storage;

    fs.writeFileSync(path.join(platform.outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  } else {
    // Chromium: Merge new AdGuard rule_resources into the base manifest
    const baseManifest = JSON.parse(fs.readFileSync(path.join(platform.baseDir, 'manifest.json'), 'utf8'));
    const compiledManifest = JSON.parse(fs.readFileSync(path.join(compiledTmpDir, 'manifest.json'), 'utf8'));
    const baseRulesets = baseManifest.declarative_net_request?.rule_resources ?? [];
    const ourRulesets  = compiledManifest.declarative_net_request?.rule_resources ?? [];
    const seen = new Set(baseRulesets.map(r => r.id));
    const { groupOverrides } = OVERRIDES;
    baseManifest.declarative_net_request = {
      ...baseManifest.declarative_net_request,
      rule_resources: [
        ...baseRulesets,
        ...ourRulesets.filter(r => !seen.has(r.id)),
      ].map(r => groupOverrides[r.id]?.enabled === false ? { ...r, enabled: false } : r),
    };
    fs.writeFileSync(path.join(platform.outDir, 'manifest.json'), JSON.stringify(baseManifest, null, 2) + '\n');
  }

  // Strip debug rulesets — dev-only, not needed in any shipped build
  const debugDir = path.join(platform.outDir, 'rulesets', 'debug');
  if (fs.existsSync(debugDir)) fs.rmSync(debugDir, { recursive: true, force: true });

  // AMO linter hard-fails on any file >5MB (FILE_TOO_LARGE, tier-1 error).
  // Generic split: find ANY oversized ruleset JSON in rulesets/main/ and split it
  // into parts <4MB each. The split is TRANSPARENT to the UI:
  //   - ruleset-details.json keeps the ORIGINAL single entry (one checkbox in dashboard)
  //   - manifest.json gets the split parts + a stub for the original ID
  //   - rulesets/split-map.json maps original->parts for the JS transparency layer
  if (platform.id === 'firefox') {
    const mainDir = path.join(platform.outDir, 'rulesets', 'main');
    const MAX_BYTES = 4 * 1024 * 1024; // 4 MB safety margin
    const splitMap = {}; // { originalId: [partId0, partId1, ...] }

    if (fs.existsSync(mainDir)) {
      for (const file of fs.readdirSync(mainDir)) {
        if (!file.endsWith('.json')) continue;
        const srcFile = path.join(mainDir, file);
        if (fs.statSync(srcFile).size <= 5 * 1024 * 1024) continue; // only split files >5MB

        const baseId = file.replace('.json', '');
        const rules = JSON.parse(fs.readFileSync(srcFile, 'utf8'));
        const parts = [];
        let current = [];
        let currentSize = 2; // for "[]"
        for (const rule of rules) {
          const entry = JSON.stringify(rule);
          const addSize = entry.length + (current.length > 0 ? 1 : 0);
          if (currentSize + addSize > MAX_BYTES && current.length > 0) {
            parts.push(current);
            current = [];
            currentSize = 2;
          }
          current.push(rule);
          currentSize += entry.length + (current.length > 1 ? 1 : 0);
        }
        if (current.length > 0) parts.push(current);

        if (parts.length <= 1) continue; // no split needed

        // Replace the oversized file with an empty stub (0 rules).
        // The stub keeps the original ID valid in the manifest so that
        // patchDefaultRulesets() doesn't strip it from saved config.
        fs.writeFileSync(srcFile, '[]\n');

        const partIds = [];
        for (let i = 0; i < parts.length; i++) {
          const partId   = `${baseId}-${i}`;
          const partFile = path.join(mainDir, `${partId}.json`);
          fs.writeFileSync(partFile, JSON.stringify(parts[i], null, 0) + '\n');
          partIds.push(partId);
        }
        splitMap[baseId] = partIds;

        // Update manifest: KEEP the original entry (now pointing to the stub),
        // and ADD one entry per split part alongside it.
        const manifestPath = path.join(platform.outDir, 'manifest.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const rr = manifest.declarative_net_request?.rule_resources ?? [];
        const origIdx = rr.findIndex(r => r.id === baseId);
        if (origIdx !== -1) {
          const orig = rr[origIdx];
          const newEntries = partIds.map(id => ({
            ...orig,
            id,
            path: orig.path.replace(baseId, id),
            enabled: false, // parts start disabled; the JS patch enables them
          }));
          // Insert parts right after the original entry
          rr.splice(origIdx + 1, 0, ...newEntries);
          manifest.declarative_net_request.rule_resources = rr;
          fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
        }

        // DO NOT split ruleset-details.json — keep the original single entry.
        // The UI shows one checkbox. The JS transparency layer handles the rest.

        console.log(`  Firefox: split ${baseId} into ${parts.length} parts (AMO 5MB limit)`);
      }
    }

    // Write the split map so the JS transparency layer knows which IDs to expand.
    // If no splits occurred, write an empty map — the JS handles that gracefully.
    const splitMapPath = path.join(platform.outDir, 'rulesets', 'split-map.json');
    fs.writeFileSync(splitMapPath, JSON.stringify(splitMap, null, 2) + '\n');
    if (Object.keys(splitMap).length > 0) {
      console.log(`  Firefox: wrote split-map.json for ${Object.keys(splitMap).length} split ruleset(s)`);
    }
  }

  // Safety net: remove any manifest rule_resources entries whose JSON file
  // wasn't generated by the converter. A dangling reference causes both Chrome
  // and Firefox to refuse to load the extension entirely.
  {
    const manifestPath = path.join(platform.outDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const rr = manifest.declarative_net_request?.rule_resources ?? [];
    const valid = rr.filter(r => {
      const filePath = path.join(platform.outDir, r.path.replace(/\//g, path.sep));
      const exists = fs.existsSync(filePath);
      if (!exists) console.log(`  Warning: removing dangling manifest entry "${r.id}" (file not found: ${r.path})`);
      return exists;
    });
    if (valid.length !== rr.length) {
      manifest.declarative_net_request.rule_resources = valid;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    }
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

      // Do not copy pipeline config files to the extension output
      if (entry.name === 'filter-overrides.json') continue;

      // _locales patches are handled by rebrandAllLocales to guarantee correct key counts.
      // Skip them here to avoid ordering bugs where the target file may not yet be correct.
      if (relDir.startsWith('_locales')) continue;

      // *.patch.json → merge into matching *.json
      if (entry.name.endsWith('.patch.json')) {
        applyPatchJson(src, dest.replace(/\.patch\.json$/, '.json'));
        continue;
      }

      // *.inject-after.js → append to matching js file in outDir
      // Idempotency: Firefox inherits already-patched Chromium JS, so check
      // whether the content was already injected to prevent duplication.
      if (entry.name.endsWith('.inject-after.js')) {
        const baseName  = entry.name.replace('.inject-after.js', '.js');
        const targetJs  = path.join(outDir, 'js', baseName);
        if (fs.existsSync(targetJs)) {
          const snippet = fs.readFileSync(src, 'utf8');
          const existing = fs.readFileSync(targetJs, 'utf8');
          if (!existing.includes(snippet.trim())) {
            fs.appendFileSync(targetJs, '\n' + snippet);
          }
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

// Rebrand all locales and apply locale patches.
// This runs AFTER applyPatches so we have full control over the final locale state.
// We read the locale patch files directly from PATCHES/_locales/ and merge them
// into the already-copied base messages.json, guaranteeing correct key counts
// regardless of file processing order in applyPatches.
function rebrandAllLocales(outDir) {
  const localesDir = path.join(outDir, '_locales');
  if (!fs.existsSync(localesDir)) return;

  const NEW_NAME = 'uBO Lite Expanded';
  const patchLocalesDir = path.join(PATCHES, '_locales');

  for (const locale of fs.readdirSync(localesDir)) {
    const msgPath = path.join(localesDir, locale, 'messages.json');
    if (!fs.existsSync(msgPath)) continue;

    let msgs = JSON.parse(fs.readFileSync(msgPath, 'utf8'));

    // Apply locale-specific patch if one exists in patches/_locales/<locale>/messages.patch.json
    const localePatchPath = path.join(patchLocalesDir, locale, 'messages.patch.json');
    if (fs.existsSync(localePatchPath)) {
      const patch = JSON.parse(fs.readFileSync(localePatchPath, 'utf8'));
      msgs = { ...msgs, ...patch };
    }

    // Always update extName for every locale
    if (msgs.extName && msgs.extName.message) {
      msgs.extName.message = NEW_NAME;
    }
    fs.writeFileSync(msgPath, JSON.stringify(msgs, null, 2) + '\n');
  }
  console.log(`  Rebranded extName in all locales, applied locale patches`);
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

    // Stamp the build version into the manifest (after all patches so nothing overwrites it).
    // Without this, Firefox inherits uBOL-home's stale version ('2024.9.22.986') which causes
    // patchDefaultRulesets() to incorrectly treat every startup as a version change and
    // reset user filter selections back to defaults.
    if (BUILD_VERSION) {
      const manifestPath = path.join(platform.outDir, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.version = BUILD_VERSION;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
      console.log(`  Stamped version: ${BUILD_VERSION}`);
    }
  }

  summary(compiledTmpDir);
  fs.rmSync(compiledTmpDir, { recursive: true, force: true });
}

main().catch(err => { console.error(err); process.exit(1); });
