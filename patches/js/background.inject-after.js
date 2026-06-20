// First-install welcome page -- appended to background.js by the build pipeline.
// Opens welcome.html exactly once when the extension is first installed.
runtime.onInstalled.addListener((details) => {
    if (details.reason !== 'install') { return; }
    browser.tabs.create({ url: runtime.getURL('welcome.html') });
});

// Split-ruleset transparency layer (Firefox AMO 5MB workaround).
// When a large ruleset file is split into multiple parts for AMO compliance,
// this patch ensures the user still sees a SINGLE checkbox in the dashboard.
// It monkey-patches the DNR API to transparently expand/collapse split IDs.
{
    const dnrObj = (self.browser || self.chrome).declarativeNetRequest;
    let splitMapPromise = null;

    function loadSplitMap() {
        if (splitMapPromise) return splitMapPromise;
        splitMapPromise = fetch(runtime.getURL('/rulesets/split-map.json'))
            .then(r => r.json())
            .catch(() => ({}));
        return splitMapPromise;
    }

    // Expand: original ID -> [original, part-0, part-1, ...]
    function expandIds(ids, map) {
        const result = [];
        for (const id of ids) {
            result.push(id);
            if (map[id]) {
                for (const partId of map[id]) result.push(partId);
            }
        }
        return result;
    }

    // Collapse: remove split-part IDs, keep only originals
    function collapseIds(ids, map) {
        // Build set of all part IDs
        const partIds = new Set();
        for (const parts of Object.values(map)) {
            for (const p of parts) partIds.add(p);
        }
        return ids.filter(id => !partIds.has(id));
    }

    // Patch updateEnabledRulesets: expand virtual IDs to physical parts
    const origUpdate = dnrObj.updateEnabledRulesets.bind(dnrObj);
    dnrObj.updateEnabledRulesets = async function(options) {
        const map = await loadSplitMap();
        if (Object.keys(map).length === 0) return origUpdate(options);
        const patched = { ...options };
        if (patched.enableRulesetIds) {
            patched.enableRulesetIds = expandIds(patched.enableRulesetIds, map);
        }
        if (patched.disableRulesetIds) {
            patched.disableRulesetIds = expandIds(patched.disableRulesetIds, map);
        }
        return origUpdate(patched);
    };

    // Patch getEnabledRulesets: collapse part IDs back to originals
    const origGetEnabled = dnrObj.getEnabledRulesets.bind(dnrObj);
    dnrObj.getEnabledRulesets = async function() {
        const [ids, map] = await Promise.all([origGetEnabled(), loadSplitMap()]);
        if (Object.keys(map).length === 0) return ids;
        return collapseIds(ids, map);
    };
}
