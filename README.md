# uBOL-Expanded

**uBlock Origin Lite Expanded** (uBOL-Expanded) is a fork of [uBO Lite](https://github.com/uBlockOrigin/uBOL-home) with AdGuard filter lists built in.

This fork uses the official uBO `make-rulesets.js` converter to compile AdGuard filter lists into Chromium's Declarative Net Request (DNR) format, then layers them on top of the standard uBOL release.

## What's different

The following AdGuard lists are compiled and bundled automatically on every release, in addition to everything already included in uBOL:

| Filter | Enabled by default |
|---|---|
| AdGuard Base (Ads + EasyList) | ✅ |
| AdGuard Tracking Protection | ☐ (opt-in) |
| AdGuard Annoyances | ☐ (opt-in) |

Everything else (EasyList, EasyPrivacy, uBlock filters, etc.) is inherited directly from the upstream uBO Lite release.

## Installation

Download the latest `uBOL-Expanded_*.chromium.zip` from the [Releases](../../releases) page.

1. Unzip the file
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** and select the unzipped folder

## How it works

A GitHub Actions workflow runs on a schedule (or manually). It:

1. Clones the uBlock source for the official `make-rulesets.js` converter
2. Downloads the latest AdGuard filter lists directly from the AdGuard CDN
3. Compiles them into DNR format
4. Injects the compiled rulesets into the upstream uBOL release
5. Creates a GitHub Release with the packaged ZIP

To add or remove filter lists, edit [`adguard-filters.json`](adguard-filters.json).

## Credits

- [uBlock Origin](https://github.com/gorhill/uBlock) by Raymond Hill (gorhill) — GPLv3
- [uBO Lite](https://github.com/uBlockOrigin/uBOL-home) by uBlockOrigin team — GPLv3
- [AdGuard filters](https://github.com/AdguardTeam/AdguardFilters) by AdGuard team

This project is also released under [GPLv3](chromium/LICENSE.txt).
