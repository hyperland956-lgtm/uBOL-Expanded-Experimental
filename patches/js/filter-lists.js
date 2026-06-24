import { dom, qs$, qsa$ } from './dom.js';
import { hashFromIterable, nodeFromTemplate } from './dashboard.js';
import { i18n, i18n$ } from './i18n.js';
import { localRead, localWrite, sendMessage } from './ext.js';

export const rulesetMap = new Map();

let cachedRulesetData = {};
let hideUnusedSet = new Set(['regions']);

const DNR_RULE_LIMIT = 30000;

const COLUMN_CONFIG = {
    easylist: ['easylist', 'easyprivacy', 'fanboy-annoyances-extra', 'fanboy-annoyances-opt'],
    adguard:  ['adguard-base-extra', 'adguard-base-opt',
                'adguard-tracking-extra', 'adguard-tracking-opt',
                'adguard-dns-opt',
                'adguard-annoyances-extra', 'adguard-annoyances-opt',
                'adguard-cookie-extra', 'adguard-cookie-opt',
                'adguard-popups-extra', 'adguard-popups-opt',
                'adguard-mobile-extra', 'adguard-mobile-opt',
                'adguard-other-extra', 'adguard-other-opt',
                'adguard-widgets-extra', 'adguard-widgets-opt'],
};

const VARIANT_PAIRS = [
    { base: 'easylist',               full: 'easylist',                  opt: null },
    { base: 'easyprivacy',            full: 'easyprivacy',               opt: null },
    { base: 'adguard-base',           full: 'adguard-base-extra',        opt: 'adguard-base-opt' },
    { base: 'adguard-tracking',       full: 'adguard-tracking-extra',    opt: 'adguard-tracking-opt' },
    { base: 'adguard-dns',            full: null,                        opt: 'adguard-dns-opt' },
    { base: 'adguard-annoyances',     full: 'adguard-annoyances-extra',  opt: 'adguard-annoyances-opt' },
    { base: 'adguard-cookie',         full: 'adguard-cookie-extra',      opt: 'adguard-cookie-opt' },
    { base: 'adguard-popups',         full: 'adguard-popups-extra',      opt: 'adguard-popups-opt' },
    { base: 'adguard-mobile',         full: 'adguard-mobile-extra',      opt: 'adguard-mobile-opt' },
    { base: 'adguard-other',          full: 'adguard-other-extra',       opt: 'adguard-other-opt' },
    { base: 'adguard-widgets',        full: 'adguard-widgets-extra',     opt: 'adguard-widgets-opt' },
    { base: 'fanboy-annoyances',      full: 'fanboy-annoyances-extra',   opt: 'fanboy-annoyances-opt' },
];

const variantPairByMember = new Map();
for (const pair of VARIANT_PAIRS) {
    if (pair.full) variantPairByMember.set(pair.full, pair);
    if (pair.opt)  variantPairByMember.set(pair.opt,  pair);
}

const idsInVariantPairs = new Set([
    ...VARIANT_PAIRS.map(p => p.full).filter(Boolean),
    ...VARIANT_PAIRS.map(p => p.opt).filter(Boolean),
]);

function rulesetStats(rulesetId) {
    const d = rulesetMap.get(rulesetId);
    if (!d) return null;
    return {
        ruleCount: (d.rules?.plain ?? 0) + (d.rules?.regex ?? 0),
        filterCount: d.filters?.accepted ?? 0,
    };
}

function renderNumber(n) { return n.toLocaleString(); }

function getEnabledIds() {
    const checked = new Set();
    for (const input of qsa$('#ubol-lists input[type="checkbox"][data-rulesetid]:checked')) {
        checked.add(input.dataset.rulesetid);
    }
    for (const btn of qsa$('#ubol-lists .ubol-variant-btn.active[data-rulesetid]')) {
        const id = btn.dataset.rulesetid;
        const cb = btn.closest('.ubol-entry')?.querySelector('input[type="checkbox"]');
        if (cb?.checked) checked.add(id);
    }
    return [...checked];
}

function updateBudgetBar() {
    const bar = qs$('#ubol-budget-bar');
    if (!bar) return;
    let total = 0;
    for (const input of qsa$('#ubol-lists input[type="checkbox"][data-rulesetid]:checked')) {
        const s = rulesetStats(input.dataset.rulesetid);
        if (s) total += s.ruleCount;
    }
    for (const btn of qsa$('#ubol-lists .ubol-variant-btn.active[data-rulesetid]')) {
        const groupCb = btn.closest('.ubol-entry')?.querySelector('input[type="checkbox"]');
        if (!groupCb?.checked) continue;
        const s = rulesetStats(btn.dataset.rulesetid);
        if (s) total += s.ruleCount;
    }
    const pct = Math.min(100, (total / DNR_RULE_LIMIT) * 100);
    const fill = qs$('#ubol-budget-fill');
    const label = qs$('#ubol-budget-label');
    const warn = qs$('#ubol-budget-warn');
    if (fill) fill.style.width = pct.toFixed(1) + '%';
    if (fill) {
        fill.className = 'ubol-budget-fill' + (pct >= 95 ? ' danger' : pct >= 75 ? ' warn' : '');
    }
    if (label) label.textContent = `${renderNumber(total)} / ${renderNumber(DNR_RULE_LIMIT)} rules`;
    if (warn)  warn.hidden = pct < 90;
}

function buildBudgetBar(container) {
    const bar = document.createElement('div');
    bar.id = 'ubol-budget-bar';
    bar.innerHTML = `
        <div class="ubol-budget-track">
            <div id="ubol-budget-fill" class="ubol-budget-fill"></div>
        </div>
        <span id="ubol-budget-label"></span>
        <span id="ubol-budget-warn" hidden>Near limit — disable some filters</span>
    `.trim();
    container.appendChild(bar);
}

function buildCheckboxSvg() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M1.73,12.91 8.1,19.28 22.79,4.59');
    svg.appendChild(path);
    return svg;
}

function buildCheckbox(id, name, checked, isDefault) {
    const wrap = document.createElement('span');
    wrap.className = 'input checkbox';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = 'cb-' + id;
    input.dataset.rulesetid = id;
    input.checked = checked;
    wrap.appendChild(input);
    wrap.appendChild(buildCheckboxSvg());
    const label = document.createElement('label');
    label.htmlFor = 'cb-' + id;
    label.className = 'ubol-list-name' + (isDefault ? ' is-default' : '');
    label.textContent = name;
    return { wrap, label };
}

function statsTitle(id) {
    const s = rulesetStats(id);
    if (!s) return '';
    return i18n$('perRulesetStats')
        .replace('{{ruleCount}}', renderNumber(s.ruleCount))
        .replace('{{filterCount}}', renderNumber(s.filterCount));
}

function buildHomeLink(homeURL) {
    if (!homeURL) return null;
    const a = document.createElement('a');
    a.className = 'fa-icon support';
    a.href = homeURL;
    a.target = '_blank';
    a.textContent = 'home';
    return a;
}

function buildVariantButtons(pair, enabledIds) {
    const row = document.createElement('div');
    row.className = 'ubol-variant-row';

    for (const [label, id] of [['Full', pair.full], ['Optimized', pair.opt]]) {
        if (!id) continue;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ubol-variant-btn' + (enabledIds.has(id) ? ' active' : '');
        btn.dataset.rulesetid = id;
        btn.textContent = label;
        const s = rulesetStats(id);
        if (s) btn.title = statsTitle(id);
        row.appendChild(btn);
    }
    return row;
}

function buildLeafEntry(ruleset, enabledIds) {
    const entry = document.createElement('div');
    entry.className = 'ubol-entry listEntry';
    entry.dataset.role = 'leaf';
    entry.dataset.rulesetid = ruleset.id;

    const bar = document.createElement('div');
    bar.className = 'ubol-bar';

    const pair = variantPairByMember.get(ruleset.id);
    const isGroupEntry = pair && (pair.full === ruleset.id || (!pair.full && pair.opt === ruleset.id));

    if (isGroupEntry && (pair.full && pair.opt)) {
        const representativeId = pair.full ?? pair.opt;
        const d = rulesetMap.get(representativeId);
        const activeId = enabledIds.has(pair.full) ? pair.full : enabledIds.has(pair.opt) ? pair.opt : null;
        const isEnabled = activeId !== null;

        const { wrap, label } = buildCheckbox(representativeId + '-grp', d?.name ?? representativeId, isEnabled, d?.enabled);
        wrap.querySelector('input').dataset.rulesetid = '';
        wrap.querySelector('input').dataset.variantGroup = representativeId;
        bar.appendChild(wrap);
        bar.appendChild(label);

        const iconBar = document.createElement('span');
        iconBar.className = 'ubol-iconbar';
        const hl = buildHomeLink(d?.homeURL);
        if (hl) iconBar.appendChild(hl);
        bar.appendChild(iconBar);

        entry.appendChild(bar);
        entry.appendChild(buildVariantButtons(pair, enabledIds));
        entry.classList.toggle('disabled', !isEnabled);
        return entry;
    }

    const on = enabledIds.has(ruleset.id);
    const { wrap, label } = buildCheckbox(ruleset.id, ruleset.name, on, ruleset.enabled);
    if (rulesetStats(ruleset.id)) wrap.querySelector('input').title = statsTitle(ruleset.id);
    bar.appendChild(wrap);
    bar.appendChild(label);

    const iconBar = document.createElement('span');
    iconBar.className = 'ubol-iconbar';
    const hl = buildHomeLink(ruleset.homeURL);
    if (hl) iconBar.appendChild(hl);
    bar.appendChild(iconBar);

    entry.appendChild(bar);
    return entry;
}

function buildSection(title, rulesets, enabledIds) {
    const section = document.createElement('div');
    section.className = 'ubol-section listEntry';
    section.dataset.role = 'rootnode';

    const header = document.createElement('div');
    header.className = 'ubol-section-header';
    const h3 = document.createElement('h3');
    h3.className = 'ubol-section-title';
    h3.textContent = title;
    header.appendChild(h3);
    section.appendChild(header);

    const rendered = new Set();
    const entries = document.createElement('div');
    entries.className = 'ubol-entries';

    for (const ruleset of rulesets) {
        if (rendered.has(ruleset.id)) continue;
        const pair = variantPairByMember.get(ruleset.id);
        if (pair && pair.full && pair.opt) {
            if (ruleset.id !== pair.full) continue;
            rendered.add(pair.full);
            rendered.add(pair.opt);
            entries.appendChild(buildLeafEntry(rulesetMap.get(pair.full), enabledIds));
        } else {
            rendered.add(ruleset.id);
            entries.appendChild(buildLeafEntry(ruleset, enabledIds));
        }
    }

    section.appendChild(entries);
    return section;
}

function buildColumn(title, groups) {
    const col = document.createElement('div');
    col.className = 'ubol-col';
    if (title) {
        const h = document.createElement('div');
        h.className = 'ubol-col-title';
        h.textContent = title;
        col.appendChild(h);
    }
    for (const [sectionTitle, rulesets, enabledIds] of groups) {
        if (!rulesets.length) continue;
        col.appendChild(buildSection(sectionTitle, rulesets, enabledIds));
    }
    return col;
}

function groupLabel(groupId) {
    const name = i18n$(`3pGroup${groupId.charAt(0).toUpperCase()}${groupId.slice(1)}`);
    return name || groupId;
}

export function renderFilterLists(rulesetData) {
    cachedRulesetData = rulesetData;
    const { enabledRulesets, rulesetDetails } = cachedRulesetData;

    rulesetDetails.forEach(r => rulesetMap.set(r.id, r));

    const enabledSet = new Set(enabledRulesets);

    const lists = qs$('#lists');
    if (!lists) return;
    lists.innerHTML = '';
    lists.classList.add('ubol-lists');
    lists.id = 'ubol-lists';

    const rulesetsPane = qs$('[data-pane-related="rulesets"]');
    if (rulesetsPane && !qs$('#ubol-budget-bar')) {
        buildBudgetBar(rulesetsPane);
    }

    const byGroup = { default: [], ads: [], privacy: [], malware: [], annoyances: [], misc: [], regions: [] };
    for (const r of rulesetDetails) {
        const g = r.group ?? 'misc';
        if (byGroup[g]) byGroup[g].push(r);
        else byGroup.misc.push(r);
    }

    const elCol = new Set(COLUMN_CONFIG.easylist);
    const adCol = new Set(COLUMN_CONFIG.adguard);

    const filterByCol = (list, colSet) => list.filter(r => colSet.has(r.id));
    const filterCommon = (list) => list.filter(r => !elCol.has(r.id) && !adCol.has(r.id));

    const grid = document.createElement('div');
    grid.className = 'ubol-grid';

    const easylistCol = buildColumn('EasyList', [
        [groupLabel('ads'),          filterByCol(byGroup.ads, elCol),       enabledSet],
        [groupLabel('privacy'),      filterByCol(byGroup.privacy, elCol),   enabledSet],
        [groupLabel('malware'),      filterByCol(byGroup.malware, elCol),   enabledSet],
        [groupLabel('annoyances'),   filterByCol(byGroup.annoyances, elCol),enabledSet],
    ]);
    easylistCol.classList.add('ubol-col-easylist');

    const adguardCol = buildColumn('AdGuard', [
        [groupLabel('ads'),          filterByCol(byGroup.ads, adCol),       enabledSet],
        [groupLabel('privacy'),      filterByCol(byGroup.privacy, adCol),   enabledSet],
        [groupLabel('annoyances'),   filterByCol(byGroup.annoyances, adCol),enabledSet],
    ]);
    adguardCol.classList.add('ubol-col-adguard');

    grid.appendChild(easylistCol);
    grid.appendChild(adguardCol);
    lists.appendChild(grid);

    const topSection = buildSection(groupLabel('default'), byGroup.default, enabledSet);
    topSection.classList.add('ubol-builtin');
    lists.insertBefore(topSection, grid);

    const miscRulesets = [
        ...filterCommon(byGroup.ads),
        ...filterCommon(byGroup.privacy),
        ...filterCommon(byGroup.malware),
        ...filterCommon(byGroup.misc),
    ];
    if (miscRulesets.length) {
        lists.appendChild(buildSection(groupLabel('misc'), miscRulesets, enabledSet));
    }

    if (byGroup.regions.length) {
        lists.appendChild(buildSection(groupLabel('regions'), byGroup.regions, enabledSet));
    }

    updateBudgetBar();
    dom.cl.remove(dom.body, 'loading');
}

const applyEnabledRulesets = (() => {
    const apply = async () => {
        dom.cl.add(dom.body, 'committing');

        const enabledRulesets = [];

        for (const input of qsa$('#ubol-lists input[type="checkbox"][data-rulesetid]:checked')) {
            const id = input.dataset.rulesetid;
            if (id) enabledRulesets.push(id);
        }

        for (const btn of qsa$('#ubol-lists .ubol-variant-btn.active[data-rulesetid]')) {
            const groupCb = btn.closest('.ubol-entry')?.querySelector('input[data-variant-group]');
            if (!groupCb?.checked) continue;
            enabledRulesets.push(btn.dataset.rulesetid);
        }

        const modified = hashFromIterable(enabledRulesets) !==
            hashFromIterable(cachedRulesetData.enabledRulesets);
        if (modified) {
            const result = await sendMessage({ what: 'applyRulesets', enabledRulesets });
            dom.text('#dnrError', result?.error || '');
        }

        dom.cl.remove(dom.body, 'committing');
    };

    let timer;
    self.addEventListener('beforeunload', () => {
        if (timer !== undefined) return;
        clearTimeout(timer);
        timer = undefined;
        apply();
    });

    return function () {
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = undefined;
            if (dom.cl.has(dom.body, 'committing')) applyEnabledRulesets();
            else apply();
        }, 997);
    };
})();

dom.on('#ubol-lists', 'change', 'input[type="checkbox"][data-rulesetid]', ev => {
    updateBudgetBar();
    applyEnabledRulesets();
});

dom.on('#ubol-lists', 'change', 'input[type="checkbox"][data-variant-group]', ev => {
    const input = ev.target;
    const entry = input.closest('.ubol-entry');
    if (!entry) return;
    entry.classList.toggle('disabled', !input.checked);
    updateBudgetBar();
    applyEnabledRulesets();
});

dom.on('#ubol-lists', 'click', '.ubol-variant-btn', ev => {
    const btn = ev.target.closest('.ubol-variant-btn');
    if (!btn) return;
    const entry = btn.closest('.ubol-entry');
    const groupCb = entry?.querySelector('input[data-variant-group]');
    if (!groupCb?.checked) return;

    const row = btn.closest('.ubol-variant-row');
    for (const b of row.querySelectorAll('.ubol-variant-btn')) {
        b.classList.toggle('active', b === btn);
    }
    updateBudgetBar();
    applyEnabledRulesets();
});

const searchFilterLists = () => {
    const pattern = dom.prop('#findInLists', 'value') || '';
    dom.cl.toggle('#ubol-lists', 'searchMode', pattern !== '');
    if (!pattern) return;
    const re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    for (const entry of qsa$('#ubol-lists .ubol-entry')) {
        const id = entry.dataset.rulesetid;
        if (!id) continue;
        const d = rulesetMap.get(id);
        const haystack = [d?.name ?? '', id, d?.group ?? '', d?.tags ?? ''].join(' ');
        dom.cl.toggle(entry, 'searchMatch', re.test(haystack));
    }
};

dom.on('#findInLists', 'input', searchFilterLists);
