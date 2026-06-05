/**
 * Mutual exclusion for filter list pairs.
 * Config is loaded from patches/filter-overrides.json → injected at build time.
 * When one list in a pair is enabled, its partner is automatically unchecked.
 */
(function () {
    const EXCLUSIVE_PAIRS = __EXCLUSIVE_PAIRS__;

    function findCheckbox(rulesetId) {
        const entry = document.querySelector(`[data-rulesetid="${rulesetId}"]`);
        return entry ? entry.querySelector(':scope > .detailbar input[type="checkbox"]') : null;
    }

    let busy = false;

    document.addEventListener('change', function (event) {
        if (busy) return;
        const cb = event.target;
        if (cb.type !== 'checkbox' || !cb.checked) return;
        const entry = cb.closest('[data-rulesetid]');
        if (!entry) return;
        const id = entry.dataset.rulesetid;
        for (const [a, b] of EXCLUSIVE_PAIRS) {
            const partnerId = id === a ? b : id === b ? a : null;
            if (!partnerId) continue;
            const partner = findCheckbox(partnerId);
            if (partner && partner.checked) {
                busy = true;
                partner.checked = false;
                partner.dispatchEvent(new Event('change', { bubbles: true }));
                busy = false;
            }
        }
    }, true);
}());
