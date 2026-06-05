# uBO Lite Expanded

## Description

[Frequently asked questions (FAQ)](https://github.com/uBlockOrigin/uBOL-home/wiki/Frequently-asked-questions-(FAQ))

**uBO Lite Expanded** (uBOL-Exp) is an efficient content blocker based on the [MV3 API](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3).

uBOL-Exp operates entirely declaratively, meaning no permanent process is required for filtering. The browser handles CSS/JS injection for content filtering, ensuring that uBOL does not consume CPU or memory resources while blocking content. The service worker process is only active when interacting with the popup panel or options pages.

The default ruleset includes at least uBlock Origin's default filter set:

- uBlock Origin's built-in filter lists
- EasyList
- EasyPrivacy
- Peter Lowe’s Ad and tracking server list

You can enable additional rulesets by visiting the options page — click the _Cogs_ icon in the popup panel.

## Changelog

See the [_Releases_](https://github.com/cudios-dev/uBOL-Expanded/releases) section.

Older releases: [Wiki/Release notes (salvaged)](https://github.com/uBlockOrigin/uBOL-home/wiki/Release-notes-(salvaged)).

## Issues

uBO Lite Expanded _extension_ issues can be reported [here](https://github.com/cudios-dev/uBOL-Expanded/issues).

Filter/website issues (ads, detection, trackers, breakage, etc.) need to be reported via the ?? _Chat_ icon in uBOL while on the affected site.

Support questions can be asked [here](https://github.com/cudios-dev/uBOL-Expanded/discussions).

## Admin Policies

uBOL exposes settings that can be defined by administrators through [managed storage](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/managed). See [Managed settings](https://github.com/uBlockOrigin/uBOL-home/wiki/Managed-settings).

## Frequently Asked Questions (FAQ)

For more information, check the [_Wiki_](https://github.com/uBlockOrigin/uBOL-home/wiki/Frequently-asked-questions-(FAQ)).

## Credits

- [uBlock Origin](https://github.com/gorhill/uBlock) by Raymond Hill (gorhill) — GPLv3
- [uBO Lite](https://github.com/uBlockOrigin/uBOL-home) by uBlockOrigin team — GPLv3
- [AdGuard filters](https://github.com/AdguardTeam/AdguardFilters) by AdGuard team

This project is also released under [GPLv3](chromium/LICENSE.txt).
