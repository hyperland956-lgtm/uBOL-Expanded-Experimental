// Patch About page: replace hardcoded upstream links with ours.
{
    const observer = new MutationObserver(() => {
        const pane = document.querySelector('[data-pane="about"]');
        if (!pane) return;
        observer.disconnect();

        for (const el of pane.querySelectorAll('.li')) {
            if (el.textContent.includes('Raymond Hill')) {
                el.textContent = 'Based on uBlock Origin Lite by Raymond Hill. uBOL-Expanded is an independent fork.';
                break;
            }
        }

        const changelogLink = pane.querySelector('a[href*="uBOL-home/releases"]');
        if (changelogLink) {
            changelogLink.href = 'https://github.com/cudios-dev/uBOL-Expanded/releases';
        }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
}
