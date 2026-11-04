# Side A

A native macOS player for your Bandcamp collection and wishlist. Side A signs in to
Bandcamp in an isolated session, syncs your library, streams full releases, keeps
music available offline, and downloads the original files you purchased in the
format Bandcamp offers.

Built with Electron, React, TypeScript and Vite. Targets **arm64 macOS**.

## Features

- **Real Bandcamp sign-in** — a dedicated, persistent Bandcamp session. Your
  password is entered on Bandcamp's own page; Side A only keeps the session cookie.
- **Collection and wishlist** — synced from your fan profile, with search, sorting,
  purchase filtering and a shuffle action.
- **Full-release streaming** — tracklists and 128 kbps streams come from Bandcamp's
  mobile tralbum API. Stream tokens are proxied through `bcmedia://` so the renderer
  never handles raw Bandcamp URLs.
- **Offline listening** — save any release to `userData/offline/<key>/`. Tracks,
  artwork and a manifest are stored locally and served through a privileged custom
  protocol with byte-range support, so seeking works without a connection.
- **Original purchase downloads** — Side A resolves your Bandcamp re-download page,
  lists the formats available for that purchase (FLAC, WAV, AIFF, ALAC, MP3, Ogg),
  and saves the file or ZIP bundle to a folder you choose.
- **Modern player** — persistent player bar, full-screen Now Playing, waveform
  scrubber, queue, shuffle/repeat, volume and macOS media-key integration.
- **Command palette** — `⌘K` to search releases or jump to any page.
- **Three accents** — teal, ember and violet, applied instantly.
- **Demo mode** — load a public Bandcamp fan collection to explore the app without
  connecting an account.

## Requirements

- macOS 12 or newer
- Apple silicon (arm64)
- A Bandcamp account with music in your collection (or use the demo)

## Development

```bash
npm install
npm run dev          # electron-vite dev server + Electron
npm run typecheck    # main/preload and renderer TypeScript checks
npm run build        # production bundles in out/
npm run icons        # regenerate build/icon.icns from the SVG mark
```

Useful environment variables:

| Variable | Purpose |
| --- | --- |
| `SIDEA_DEMO=1` | Start with the public demo collection loaded. |
| `SIDEA_DEVTOOLS=1` | Open Chromium DevTools in a detached window. |

## Packaging

```bash
npm run package       # arm64 DMG + ZIP in release/
npm run package:dir   # unpacked Side A.app in release/mac-arm64/
```

The build is intentionally **unsigned** (`identity: null`). On first launch macOS
Gatekeeper may block it. For a locally built copy:

```bash
xattr -dr com.apple.quarantine "release/mac-arm64/Side A.app"
```

or use **System Settings → Privacy & Security → Open Anyway**.

## How sign-in works

1. Choose **Continue with Bandcamp**. A `BrowserWindow` opens on `bandcamp.com`
   using the persistent partition `persist:bandcamp`.
2. Sign in normally, including two-factor authentication if enabled.
3. Side A watches for the `identity` cookie, then reads your fan profile.
4. If Bandcamp does not expose a username, the welcome screen asks for it once.
5. The session is reused across launches. **Sign out** clears the partition.

## Where data lives

All application data is under:

```
~/Library/Application Support/Side A/
├── side-a.json        # library, details cache, settings, offline manifest
├── offline/           # cached 128 kbps tracks + cover art per release
├── media/             # reserved for local media
└── logs/
```

Purchased original files are saved to `~/Downloads/Side A/` by default. You can
change this in **Settings → Downloads**.

## Purchase downloads

Purchased releases include a `redownload_url` from Bandcamp. Side A:

1. Loads the re-download page.
2. Reads the `digital_items[].downloads` list.
3. Requests `/statdownload` for the selected format.
4. Parses Bandcamp's `Downloads.statResult(...)` payload and streams the file.

If Bandcamp does not expose a re-download link for a purchase (common for very old
purchases, gift codes or region restrictions), the app says so instead of guessing.
Downloads can be resumed after an interruption by starting them again.

## Design notes

- Dark charcoal canvas, cream login panel, teal accent by default.
- Inter Variable for UI, Space Grotesk for display type. Fonts are bundled.
- Custom title bar with inset traffic lights and a draggable top bar.
- Artwork is loaded from Bandcamp's `f4.bcbits.com` CDN, or locally from the
  offline copy through `bcmedia://cover/<key>`.

## Security and privacy

- `contextIsolation` and `sandbox` are enabled; Node is not exposed to the renderer.
- IPC handlers validate release keys, track IDs, formats and URLs.
- External links open in the system browser, never inside the app.
- The renderer CSP allows only the app, Bandcamp, `f4.bcbits.com`, and `bcmedia:`.
- No analytics, telemetry, or third-party services are involved.

## Limitations

- Side A is a personal client, not an official Bandcamp product. Respect Bandcamp's
  terms and only download music you have purchased.
- Streaming depends on Bandcamp's unpublished mobile endpoints. If Bandcamp changes
  them, streaming and tracklist loading may need updating.
- Stream URLs expire; offline copies are the reliable option for long-term listening.
- Wishlist items can usually be previewed, but original downloads only exist for
  purchases.
- The app is unsigned and not notarized.
- Offline audio is cached at 128 kbps to keep storage reasonable. Original purchased
  files are downloaded separately and stay lossless where offered.

## Project layout

```
src/main/        Electron main process
  auth.ts        Bandcamp login window and session discovery
  bandcamp.ts    fan page parsing, collection API, tralbum details, purchases
  library.ts     sync, album cache, offline save/remove
  media.ts       bcmedia:// stream, local range requests, covers
  purchases.ts   re-download resolution and file streaming
  ipc.ts         validated IPC surface and snapshots
src/preload/     contextBridge API
src/renderer/    React UI (pages, components, stores, styles)
src/shared/      shared types and IPC channel names
scripts/         icon generation and UI capture helpers
```

Side A is not affiliated with Bandcamp.
