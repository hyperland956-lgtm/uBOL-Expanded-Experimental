// Patch About page: replace hardcoded upstream links with ours.
{
    const observer = new MutationObserver(() => {
        const pane = document.querySelector('[data-pane="about"]');
        if (!pane) return;
        observer.disconnect();

        // Replace the copyright attribution line
        for (const el of pane.querySelectorAll('.li')) {
            if (el.textContent.includes('Raymond Hill')) {
                el.textContent = 'Based on uBlock Origin Lite by Raymond Hill. uBOL-Expanded is an independent fork.';
                break;
            }
        }

        // Redirect changelog link to our own releases page
        const changelogLink = pane.querySelector('a[href*="uBOL-home/releases"]');
        if (changelogLink) {
            changelogLink.href = 'https://github.com/cudios-dev/uBOL-Expanded/releases';
        }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
}

// Show static rule limit alongside the rule count header.
// The header element (#listsOfBlockedHostsPrompt) displays "X rules, converted from Y filters".
// We append " [Limit: Z]" where Z is the browser's guaranteed minimum static rule count.
{
    const dnr = (self.browser || self.chrome).declarativeNetRequest;
    const promptEl = document.getElementById('listsOfBlockedHostsPrompt');
    if (promptEl && dnr) {
        const origObserver = new MutationObserver(async () => {
            // Only run when the text actually changes (filter toggle)
            const text = promptEl.textContent || '';
            if (!text || text.includes('[Limit:')) return;
            try {
                const available = await dnr.getAvailableStaticRuleCount();
                // Parse current enabled rule count from the text
                const match = text.match(/^([\d,. ]+)\s*rules/);
                if (match) {
                    const usedStr = match[1].replace(/[,.\s]/g, '');
                    const used = parseInt(usedStr, 10);
                    if (!isNaN(used)) {
                        const total = used + available;
                        promptEl.textContent = `${text}  [Limit: ${total.toLocaleString()}]`;
                    }
                }
            } catch(e) { /* DNR API may not be available in this context */ }
        });
        origObserver.observe(promptEl, { childList: true, characterData: true, subtree: true });
    }
}
