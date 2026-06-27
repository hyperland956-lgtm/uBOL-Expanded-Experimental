import { dom, qs$, qsa$ } from './dom.js';
import { hashFromIterable, nodeFromTemplate } from './dashboard.js';
import { i18n, i18n$ } from './i18n.js';
import { localRead, localWrite, sendMessage } from './ext.js';
import { faIconsInit } from './fa-icons.js';

export const rulesetMap = new Map();

let cachedRulesetData = {};

const DNR_RULE_LIMIT = 30000;

const COLUMN_CONFIG = {
    easylist: new Set([
        'easylist',          'easylist-opt',
        'easyprivacy',       'easyprivacy-opt',
        'annoyances-cookies',
        'annoyances-overlays',
        'annoyances-social',
        'annoyances-widgets',
        'annoyances-others',
        'annoyances-notifications',
        'annoyances-ai',
    ]),
    adguard: new Set([
        'adguard-base-without-el',    'adguard-base-without-el-opt',
        'adguard-tracking-extra',     'adguard-tracking-opt',
        'adguard-spyware-url',
        'adguard-dns-opt',
        'adguard-mobile',
        'adguard-mobile-extra',       'adguard-mobile-opt',
        'adguard-cookie-extra',       'adguard-cookie-opt',
        'adguard-popups-extra',       'adguard-popups-opt',
        'adguard-other-extra',        'adguard-other-opt',
        'adguard-widgets-extra',      'adguard-widgets-opt',
    ]),
};

const MISC_ORDER = [
    'cudios-tracking-full',      // first — Comprehensive Tracking Protection
    'block-lan',
    'urlhaus-full',
    'oisd-nsfw-extra',
    'adguard-search-ads',
];

const VARIANT_PAIRS = [
    { full: 'cudios-tracking-full',       opt: 'cudios-tracking-opt' },
    { full: 'easylist',                   opt: 'easylist-opt' },
    { full: 'easyprivacy',                opt: 'easyprivacy-opt' },
    { full: 'adguard-base-without-el',    opt: 'adguard-base-without-el-opt' },
    { full: 'adguard-tracking-extra',     opt: 'adguard-tracking-opt' },
    { full: null,                         opt: 'adguard-dns-opt' },
    { full: 'adguard-cookie-extra',       opt: 'adguard-cookie-opt' },
    { full: 'adguard-popups-extra',       opt: 'adguard-popups-opt' },
    { full: 'adguard-mobile-extra',       opt: 'adguard-mobile-opt' },
    { full: 'adguard-other-extra',        opt: 'adguard-other-opt' },
    { full: 'adguard-widgets-extra',      opt: 'adguard-widgets-opt' },
];

const variantPairOf = new Map();
for (const pair of VARIANT_PAIRS) {
    if (pair.full) variantPairOf.set(pair.full, pair);
    if (pair.opt)  variantPairOf.set(pair.opt,  pair);
}

const isPairedId = id => variantPairOf.has(id);

function rulesetStats(id) {
    const d = rulesetMap.get(id);
    if (!d) return null;
    return {
        ruleCount:   (d.rules?.plain ?? 0) + (d.rules?.regex ?? 0),
        filterCount: d.filters?.accepted ?? 0,
    };
}

function renderNum(n) { return n.toLocaleString(); }

function statsTitle(id) {
    const s = rulesetStats(id);
    if (!s) return '';
    return i18n$('perRulesetStats')
        .replace('{{ruleCount}}',   renderNum(s.ruleCount))
        .replace('{{filterCount}}', renderNum(s.filterCount));
}

function updateBudgetBar() {
    const bar = qs$('#ubol-budget-bar');
    if (!bar) return;

    let total = 0;
    for (const input of qsa$('#lists input[type="checkbox"][data-rulesetid]:checked')) {
        const s = rulesetStats(input.dataset.rulesetid);
        if (s) total += s.ruleCount;
    }
    for (const btn of qsa$('#lists .ubol-variant-btn.active')) {
        const entry = btn.closest('.ubol-entry');
        const cbEl  = entry?.querySelector('input[data-variant-group]');
        if (!cbEl?.checked) continue;
        const s = rulesetStats(btn.dataset.rulesetid);
        if (s) total += s.ruleCount;
    }

    const pct   = Math.min(100, (total / DNR_RULE_LIMIT) * 100);
    const fill  = bar.querySelector('.ubol-budget-fill');
    const label = bar.querySelector('.ubol-budget-label');
    const warn  = bar.querySelector('.ubol-budget-warn');

    if (fill) {
        fill.style.width = pct.toFixed(1) + '%';
        fill.className = 'ubol-budget-fill' + (pct >= 95 ? ' danger' : pct >= 75 ? ' warn' : '');
    }
    if (label) label.textContent = `${renderNum(total)} / ${renderNum(DNR_RULE_LIMIT)} rules`;
    if (warn)  warn.hidden = pct < 90;

    return total;
}

function updateBudgetLimit() {
    // Get current total (reuse the bar calculation's side-effect-free version)
    let currentTotal = 0;
    for (const input of qsa$('#lists input[type="checkbox"][data-rulesetid]:checked')) {
        const s = rulesetStats(input.dataset.rulesetid);
        if (s) currentTotal += s.ruleCount;
    }
    for (const btn of qsa$('#lists .ubol-variant-btn.active')) {
        const entry = btn.closest('.ubol-entry');
        const cbEl  = entry?.querySelector('input[data-variant-group]');
        if (!cbEl?.checked) continue;
        const s = rulesetStats(btn.dataset.rulesetid);
        if (s) currentTotal += s.ruleCount;
    }

    // ---- Simple entries (single checkbox, no variant buttons) ----
    for (const entry of qsa$('#lists .ubol-entry[data-rulesetid]')) {
        const input = entry.querySelector('input[data-rulesetid]');
        if (!input) continue;
        if (input.checked) {
            // Already on — always removable, clear any over-limit state
            entry.classList.remove('ubol-over-limit');
            input.disabled = false;
        } else {
            const s = rulesetStats(input.dataset.rulesetid);
            const cost = s?.ruleCount ?? 0;
            const overLimit = cost > 0 && (currentTotal + cost) > DNR_RULE_LIMIT;
            entry.classList.toggle('ubol-over-limit', overLimit);
            input.disabled = overLimit;
        }
    }

    // ---- Variant entries (Full / Optimized checkbox + buttons) ----
    for (const entry of qsa$('#lists .ubol-entry[data-variant-group]')) {
        const cbEl = entry.querySelector('input[data-variant-group]');
        if (!cbEl) continue;

        const row = entry.querySelector('.ubol-variant-row');
        const btns = row ? Array.from(row.querySelectorAll('.ubol-variant-btn')) : [];

        if (!cbEl.checked) {
            // Whole list is OFF — disable if even the cheapest variant would exceed cap
            let minCost = Infinity;
            for (const btn of btns) {
                const s = rulesetStats(btn.dataset.rulesetid);
                if (s && s.ruleCount < minCost) minCost = s.ruleCount;
            }
            const overLimit = minCost !== Infinity && (currentTotal + minCost) > DNR_RULE_LIMIT;
            entry.classList.toggle('ubol-over-limit', overLimit);
            cbEl.disabled = overLimit;
            // Clear per-button state (list is off, buttons are irrelevant visually)
            for (const btn of btns) btn.classList.remove('ubol-btn-over-limit');
        } else {
            // List is ON — clear entry-level limit, check per-button
            entry.classList.remove('ubol-over-limit');
            cbEl.disabled = false;

            // Cost of the currently active variant (so we subtract it before comparing)
            const activeBtn = row?.querySelector('.ubol-variant-btn.active');
            const activeCost = activeBtn ? (rulesetStats(activeBtn.dataset.rulesetid)?.ruleCount ?? 0) : 0;
            const baseTotal  = currentTotal - activeCost;

            for (const btn of btns) {
                if (btn === activeBtn) {
                    btn.classList.remove('ubol-btn-over-limit');
                    btn.disabled = false;
                    continue;
                }
                const s = rulesetStats(btn.dataset.rulesetid);
                const cost = s?.ruleCount ?? 0;
                const overLimit = cost > 0 && (baseTotal + cost) > DNR_RULE_LIMIT;
                btn.classList.toggle('ubol-btn-over-limit', overLimit);
                btn.disabled = overLimit;
            }
        }
    }
}

function buildBudgetBar() {
    const existing = qs$('#ubol-budget-bar');
    if (existing) return;
    const container = qs$('[data-pane-related="rulesets"]');
    if (!container) return;
    const bar = document.createElement('div');
    bar.id = 'ubol-budget-bar';
    bar.innerHTML =
        '<div class="ubol-budget-track"><div class="ubol-budget-fill"></div></div>' +
        '<span class="ubol-budget-label"></span>' +
        '<span class="ubol-budget-warn" hidden>Near limit</span>';
    container.appendChild(bar);
}

function makeCheckbox(id, checked) {
    const wrap = document.createElement('span');
    wrap.className = 'input checkbox';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.dataset.rulesetid = id;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M1.73,12.91 8.1,19.28 22.79,4.59');
    svg.appendChild(path);
    wrap.appendChild(input);
    wrap.appendChild(svg);
    return { wrap, input };
}

function makeHomeLink(homeURL) {
    if (!homeURL) return null;
    const a = document.createElement('a');
    a.className = 'fa-icon support';
    a.href = homeURL;
    a.target = '_blank';
    a.textContent = 'home';
    return a;
}

function makeInfoButton(infoText) {
    if (!infoText) return null;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ubol-info-btn';
    btn.setAttribute('aria-label', infoText);

    const icon = document.createElement('span');
    icon.textContent = 'ⓘ';
    btn.appendChild(icon);

    const tip = document.createElement('span');
    tip.className = 'ubol-info-tip';
    tip.textContent = infoText;
    btn.appendChild(tip);

    return btn;
}

function buildVariantEntry(pair, enabledIds) {
    const primaryId = pair.full ?? pair.opt;
    const d = rulesetMap.get(primaryId);
    const activeId = pair.full && enabledIds.has(pair.full) ? pair.full
                   : pair.opt  && enabledIds.has(pair.opt)  ? pair.opt
                   : null;
    const isOn = activeId !== null;

    const entry = document.createElement('div');
    entry.className = 'ubol-entry' + (isOn ? '' : ' disabled');
    entry.dataset.variantGroup = primaryId;

    const bar = document.createElement('div');
    bar.className = 'ubol-bar';

    const { wrap, input } = makeCheckbox('', isOn);
    input.removeAttribute('data-rulesetid');
    input.dataset.variantGroup = primaryId;

    const label = document.createElement('label');
    label.className = 'ubol-list-name';
    label.textContent = d?.name ?? primaryId;

    const iconBar = document.createElement('span');
    iconBar.className = 'ubol-iconbar';
    const ib = makeInfoButton(d?.info ?? null);
    if (ib) iconBar.appendChild(ib);
    const hl = makeHomeLink(d?.homeURL);
    if (hl) iconBar.appendChild(hl);

    bar.appendChild(wrap);
    bar.appendChild(label);
    bar.appendChild(iconBar);
    entry.appendChild(bar);

    if (pair.full && pair.opt) {
        const row = document.createElement('div');
        row.className = 'ubol-variant-row';

        for (const [btnLabel, id] of [['Full', pair.full], ['Optimized', pair.opt]]) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ubol-variant-btn' + (activeId === id ? ' active' : '');
            btn.dataset.rulesetid = id;
            btn.textContent = btnLabel;
            const s = rulesetStats(id);
            if (s) btn.title = statsTitle(id);
            row.appendChild(btn);
        }
        entry.appendChild(row);
    }

    return entry;
}

function buildSimpleEntry(ruleset, enabledIds) {
    const entry = document.createElement('div');
    entry.className = 'ubol-entry';
    entry.dataset.rulesetid = ruleset.id;
    if (ruleset.lang) entry.dataset.nodeid = ruleset.lang;

    const bar = document.createElement('div');
    bar.className = 'ubol-bar';

    const { wrap, input } = makeCheckbox(ruleset.id, enabledIds.has(ruleset.id));
    const s = rulesetStats(ruleset.id);
    if (s) wrap.title = statsTitle(ruleset.id);

    const label = document.createElement('label');
    label.className = 'ubol-list-name';
    label.textContent = ruleset.name;

    const iconBar = document.createElement('span');
    iconBar.className = 'ubol-iconbar';
    const ib = makeInfoButton(ruleset.info ?? null);
    if (ib) iconBar.appendChild(ib);
    const hl = makeHomeLink(ruleset.homeURL);
    if (hl) iconBar.appendChild(hl);

    bar.appendChild(wrap);
    bar.appendChild(label);
    bar.appendChild(iconBar);
    entry.appendChild(bar);
    return entry;
}

function buildSection(title, rulesets, enabledIds) {
    if (!rulesets.length) return null;
    const section = document.createElement('div');
    section.className = 'ubol-section';

    const h3 = document.createElement('h3');
    h3.className = 'ubol-section-title';
    h3.textContent = title;
    section.appendChild(h3);

    const inner = document.createElement('div');
    inner.className = 'ubol-entries';

    const rendered = new Set();
    for (const ruleset of rulesets) {
        if (rendered.has(ruleset.id)) continue;
        const pair = variantPairOf.get(ruleset.id);

        if (pair && pair.full && pair.opt) {
            if (ruleset.id !== pair.full) continue;
            rendered.add(pair.full);
            rendered.add(pair.opt);
            inner.appendChild(buildVariantEntry(pair, enabledIds));
        } else {
            rendered.add(ruleset.id);
            inner.appendChild(buildSimpleEntry(ruleset, enabledIds));
        }
    }

    section.appendChild(inner);
    return section;
}

function groupLabel(id) {
    const key = `3pGroup${id.charAt(0).toUpperCase()}${id.slice(1)}`;
    return i18n$(key) || id;
}

export function renderFilterLists(rulesetData) {
    cachedRulesetData = rulesetData;
    const { enabledRulesets, rulesetDetails } = cachedRulesetData;

    rulesetDetails.forEach(r => rulesetMap.set(r.id, r));
    const enabledIds = new Set(enabledRulesets);

    const listsEl = qs$('#lists');
    if (!listsEl) return;
    listsEl.innerHTML = '';

    buildBudgetBar();

    const byGroup = { default: [], ads: [], privacy: [], malware: [], annoyances: [], misc: [], regions: [] };
    for (const r of rulesetDetails) {
        const g = r.group ?? 'misc';
        (byGroup[g] ?? byGroup.misc).push(r);
    }

    const { easylist: elSet, adguard: adSet } = COLUMN_CONFIG;
    const filterCol = (list, set) => list.filter(r => set.has(r.id) || (variantPairOf.get(r.id) && set.has(variantPairOf.get(r.id).full ?? variantPairOf.get(r.id).opt)));
    const filterCommon = list => list.filter(r => !elSet.has(r.id) && !adSet.has(r.id) && !isPairedId(r.id));

    // Only exclude paired IDs that are actually rendered in the column grid (easylist/adguard).
    // Misc-group variant pairs (e.g. cudios-tracking) must NOT be excluded — they need
    // to reach buildSection so buildVariantEntry can render them.
    const colPairedIds = new Set(
        VARIANT_PAIRS
            .filter(p => elSet.has(p.full) || elSet.has(p.opt) || adSet.has(p.full) || adSet.has(p.opt))
            .flatMap(p => [p.full, p.opt].filter(Boolean))
    );
    const allInCols = new Set([...elSet, ...adSet, ...colPairedIds]);
    const filterCommonAll = list => list.filter(r => !allInCols.has(r.id));

    const frag = document.createDocumentFragment();

    const builtinSection = buildSection(groupLabel('default'), byGroup.default, enabledIds);
    if (builtinSection) { builtinSection.classList.add('ubol-builtin'); frag.appendChild(builtinSection); }

    const grid = document.createElement('div');
    grid.className = 'ubol-grid';

    const elCol = document.createElement('div');
    elCol.className = 'ubol-col ubol-col-easylist';
    const elTitle = document.createElement('div');
    elTitle.className = 'ubol-col-title';
    elTitle.textContent = 'EasyList';
    elCol.appendChild(elTitle);

    for (const [gid, groupRulesets] of [
        ['ads',        byGroup.ads],
        ['privacy',    byGroup.privacy],
        ['malware',    byGroup.malware],
        ['annoyances', byGroup.annoyances],
    ]) {
        const s = buildSection(groupLabel(gid), groupRulesets.filter(r => elSet.has(r.id)), enabledIds);
        if (s) elCol.appendChild(s);
    }

    const adCol = document.createElement('div');
    adCol.className = 'ubol-col ubol-col-adguard';
    const adTitle = document.createElement('div');
    adTitle.className = 'ubol-col-title';
    adTitle.textContent = 'AdGuard';
    adCol.appendChild(adTitle);

    for (const [gid, groupRulesets] of [
        ['ads',        byGroup.ads],
        ['privacy',    byGroup.privacy],
        ['annoyances', byGroup.annoyances],
    ]) {
        const filtered = groupRulesets.filter(r => {
            if (adSet.has(r.id)) return true;
            const pair = variantPairOf.get(r.id);
            return pair && (adSet.has(pair.full) || adSet.has(pair.opt));
        });
        const s = buildSection(groupLabel(gid), filtered, enabledIds);
        if (s) adCol.appendChild(s);
    }

    grid.appendChild(elCol);
    grid.appendChild(adCol);
    frag.appendChild(grid);

    const allMiscRaw = [
        ...filterCommonAll(byGroup.ads),
        ...filterCommonAll(byGroup.privacy),
        ...filterCommonAll(byGroup.malware),
        ...filterCommonAll(byGroup.misc),
    ];
    const miscOrdered = [];
    for (const id of MISC_ORDER) {
        const r = allMiscRaw.find(x => x.id === id);
        if (r) miscOrdered.push(r);
    }
    for (const r of allMiscRaw) {
        if (!MISC_ORDER.includes(r.id)) miscOrdered.push(r);
    }
    const miscSection = buildSection(groupLabel('misc'), miscOrdered, enabledIds);
    if (miscSection) frag.appendChild(miscSection);

    const regionsSection = buildSection(groupLabel('regions'), byGroup.regions, enabledIds);
    if (regionsSection) frag.appendChild(regionsSection);

    listsEl.appendChild(frag);
    faIconsInit(listsEl);
    updateBudgetBar();
    updateBudgetLimit();
}

const applyEnabledRulesets = (() => {
    const collect = () => {
        const ids = [];
        for (const input of qsa$('#lists input[type="checkbox"][data-rulesetid]:checked')) {
            if (input.dataset.rulesetid) ids.push(input.dataset.rulesetid);
        }
        for (const btn of qsa$('#lists .ubol-variant-btn.active')) {
            const entry = btn.closest('.ubol-entry');
            const cbEl  = entry?.querySelector('input[data-variant-group]');
            if (!cbEl?.checked) continue;
            if (btn.dataset.rulesetid) ids.push(btn.dataset.rulesetid);
        }
        return ids;
    };

    const apply = async () => {
        dom.cl.add(dom.body, 'committing');
        const enabledRulesets = collect();
        const modified = hashFromIterable(enabledRulesets) !==
            hashFromIterable(cachedRulesetData.enabledRulesets);
        if (modified) {
            const result = await sendMessage({ what: 'applyRulesets', enabledRulesets });
            dom.text('#dnrError', result?.error || '');
        }
        dom.cl.remove(dom.body, 'committing');
    };

    let timer;
    self.addEventListener('beforeunload', () => { clearTimeout(timer); apply(); });

    return () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            timer = undefined;
            if (dom.cl.has(dom.body, 'committing')) applyEnabledRulesets();
            else apply();
        }, 997);
    };
})();

dom.on('#lists', 'change', 'input[data-rulesetid]', () => {
    updateBudgetBar();
    updateBudgetLimit();
    applyEnabledRulesets();
});

dom.on('#lists', 'change', 'input[data-variant-group]', ev => {
    const input = ev.target;
    const entry = input.closest('.ubol-entry');
    if (!entry) return;

    const isOn = input.checked;
    entry.classList.toggle('disabled', !isOn);

    if (isOn) {
        const row = entry.querySelector('.ubol-variant-row');
        if (row) {
            const hasActive = row.querySelector('.ubol-variant-btn.active');
            if (!hasActive) {
                const firstBtn = row.querySelector('.ubol-variant-btn');
                if (firstBtn) firstBtn.classList.add('active');
            }
        }
    }

    updateBudgetBar();
    updateBudgetLimit();
    applyEnabledRulesets();
});

dom.on('#lists', 'click', '.ubol-variant-btn', ev => {
    const btn = ev.target.closest('.ubol-variant-btn');
    if (!btn) return;
    const entry = btn.closest('.ubol-entry');
    if (!entry || entry.classList.contains('disabled')) return;

    const row = btn.closest('.ubol-variant-row');
    for (const b of row.querySelectorAll('.ubol-variant-btn')) {
        b.classList.toggle('active', b === btn);
    }
    updateBudgetBar();
    updateBudgetLimit();
    applyEnabledRulesets();
});

dom.on('#findInLists', 'input', () => {
    const pattern = dom.prop('#findInLists', 'value') || '';
    dom.cl.toggle('#lists', 'searchMode', pattern !== '');
    if (!pattern) return;
    const re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    for (const entry of qsa$('#lists .ubol-entry')) {
        const id = entry.dataset.rulesetid || entry.dataset.variantGroup || '';
        const d = rulesetMap.get(id);
        const hay = [d?.name ?? '', id, d?.group ?? '', d?.tags ?? ''].join(' ');
        dom.cl.toggle(entry, 'searchMatch', re.test(hay));
    }
});
