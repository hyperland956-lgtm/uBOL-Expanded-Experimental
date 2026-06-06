# uBOL Expanded

**uBOL Expanded** (uBOL-Exp) is an independent fork of [uBO Lite](https://github.com/uBlockOrigin/uBOL-home) which is an efficient, MV3-based content blocker by Raymond Hill. This fork bundles extra AdGuard filter lists on top of the standard uBO Lite defaults, with no extra CPU or memory cost.

## What's Different from uBO Lite

The default ruleset includes at least uBlock Origin's default filter set:

- uBlock Origin's built-in filter lists
- EasyList
- EasyPrivacy
- Peter Lowe's Ad and tracking server list

On top of that, uBOL-Exp adds these **optional** filter lists you can enable in the options page:

- **AdGuard Base filter**: broader ad blocking coverage
- **AdGuard Tracking Protection**: extended tracker blocking
- **AdGuard Annoyances**: cookie banners, popups, and other annoyances

AdGuard lists are mutually exclusive with their EasyList equivalents. Enabling one automatically disables the other to avoid any potential rule conflicts.

## How It Works

uBOL-Exp operates entirely declaratively using the [MV3 API](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3), meaning no permanent background process is required for filtering. The browser handles CSS/JS injection for content filtering, ensuring uBOL-Exp does not consume CPU or memory while blocking content. The service worker process is only active when interacting with the popup panel or options pages.

You can enable or disable rulesets by visiting the options page; click the _Cogs_ icon in the popup panel.

## Installation

### Firefox
Available on the [Firefox Add-ons Store (AMO)](https://addons.mozilla.org/en-US/firefox/addon/ubol-expanded/).

### Chromium (Chrome, Edge, Brave, etc.)
Download the latest `.chromium.zip` release from the [Releases page](https://github.com/cudios-dev/uBOL-Expanded/releases) and load it unpacked in developer mode.

## Changelog

See the [_Releases_](https://github.com/cudios-dev/uBOL-Expanded/releases) section.

Older upstream releases: [Wiki/Release notes (salvaged)](https://github.com/uBlockOrigin/uBOL-home/wiki/Release-notes-(salvaged)).

## Issues & Support

- **Extension bugs:** Report at the [GitHub Issues page](https://github.com/cudios-dev/uBOL-Expanded/issues).
- **Filter issues** (ads not blocked, site breakage, tracker detection, etc.): Report via the _Chat_ icon in uBOL while on the affected site.
- **Questions:** Ask in [Discussions](https://github.com/cudios-dev/uBOL-Expanded/discussions).

## Admin Policies

uBOL-Exp exposes settings that can be defined by administrators through [managed storage](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/managed). See [Managed settings](https://github.com/uBlockOrigin/uBOL-home/wiki/Managed-settings).

## FAQ

See the upstream [FAQ](https://github.com/uBlockOrigin/uBOL-home/wiki/Frequently-asked-questions-(FAQ)), most answers apply here too.

## Credits

- [uBlock Origin](https://github.com/gorhill/uBlock) by Raymond Hill (gorhill), GPLv3
- [uBO Lite](https://github.com/uBlockOrigin/uBOL-home) by the uBlockOrigin team, GPLv3
- [AdGuard filters](https://github.com/AdguardTeam/AdguardFilters) by the AdGuard team

This project is an independent fork released under [GPLv3](LICENSE.txt).
