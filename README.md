# Side A

A desktop player for your Bandcamp collection and wishlist, on macOS and Windows.
Side A signs in to Bandcamp in an isolated session, syncs your library, streams full
releases, keeps music available offline, and downloads the original files you
purchased in the format Bandcamp offers.

Built with Electron, React, TypeScript and Vite. Targets **arm64 macOS** and
**Windows 10 and newer (x64)**.

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
- **Last.fm scrobbling** — optional. Side A authorises against your own Last.fm API
  account, sends now-playing updates, and queues scrobbles locally so plays survive a
  dropped connection. Keys and the session are sealed with the operating system
  credential store (Keychain on macOS, DPAPI on Windows).
- **Discord Rich Presence** — optional "Listening to" status with the release, track and
  a live progress bar, using your own Discord application ID.
- **Any accent, dark or light** — pick any colour with the colour picker, and switch
  the whole interface between a dark and a light room. Tints are derived from the
  accent you choose.
- **Demo mode** — load a public Bandcamp fan collection to explore the app without
  connecting an account.

## Requirements

- macOS 12 or newer on Apple silicon (arm64), or Windows 10 / 11 on x64
- A Bandcamp account with music in your collection (or use the demo)

Windows support is built on Electron 45, which requires Windows 10 (1809) or newer.
The app is a per-user install, so no administrator rights are needed.

## Development

```bash
npm install
npm run dev          # electron-vite dev server + Electron
npm run typecheck    # main/preload and renderer TypeScript checks
npm run build        # production bundles in out/
npm run icons        # regenerate build/icon.icns from the SVG mark (macOS only)
npm run icons:ico    # regenerate build/icon.ico from build/icon.png
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
npm run package:win   # Windows x64 installer + ZIP in release/
```

The Windows targets are built from `build/icon.ico` (regenerate it with
`npm run icons:ico` after changing the artwork):

| Target | Output |
| --- | --- |
| `nsis` | `Side A-<version>-win-x64.exe` — per-user installer with a directory picker |
| `zip` | `Side A-<version>-win-x64.zip` — portable, unpack and run `Side A.exe` |

Cross-building on macOS or Linux needs no Wine: Electron Builder handles the PE
resources and NSIS itself. Run `npm run typecheck` and `npm run build` first so
`out/` is current, or just use `npm run package:win`, which does both.

Both platforms are intentionally **unsigned** (`identity: null`, no Windows
certificate), so mac builds are ad-hoc signed by `scripts/after-pack.mjs` to keep
Gatekeeper from calling the bundle damaged. On first launch:

- macOS may still quarantine the downloaded app. Either right-click it and choose
  **Open**, or clear the flag once:
  `xattr -cr "/Applications/Side A.app"`. Locally built copies use the same command
  against `release/mac-arm64/Side A.app`.
- Windows SmartScreen shows "Windows protected your PC" for the installer and the
  portable exe. Choose **More info → Run anyway**; this disappears once the build is
  signed with a code-signing certificate.

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
~/Library/Application Support/Side A/      # macOS
%APPDATA%\Side A\                          # Windows
├── side-a.json        # library, details cache, settings, integration state
├── offline/           # cached 128 kbps tracks + cover art per release
├── media/             # reserved for local media
└── logs/
```

Purchased original files and per-track downloads are saved to `Downloads/Side A/`
inside your home folder by default. You can change this in **Settings → Downloads**.

## Purchase downloads

Purchased releases include a `redownload_url` from Bandcamp. Side A:

1. Loads the re-download page.
2. Reads the `digital_items[].downloads` list.
3. Requests `/statdownload` for the selected format.
4. Parses Bandcamp's `Downloads.statResult(...)` payload and streams the file.

If Bandcamp does not expose a re-download link for a purchase (common for very old
purchases, gift codes or region restrictions), the app says so instead of guessing.
Downloads can be resumed after an interruption by starting them again.

## Integrations

Both integrations are configured in **Settings** and stay disabled until you turn them on.

**Last.fm**

1. Create an API account at [last.fm/api/account/create](https://www.last.fm/api/account/create).
2. Paste the API key and shared secret into **Settings → Last.fm scrobbling**.
3. Press **Connect Last.fm** and approve access in the window that opens.

Plays are scrobbled once a track has been heard for half its length or four minutes,
whichever comes first (Last.fm ignores tracks under 30 seconds). If Last.fm is
unreachable the scrobble is queued in `side-a.json` and retried every minute and on the
next launch.

**Discord**

1. Create an application at [discord.com/developers/applications](https://discord.com/developers/applications).
2. Copy its **Application ID** into **Settings → Discord Rich Presence** and enable the toggle.

Presence needs the Discord desktop app running; Side A reconnects automatically when it
starts. Artwork is passed as an external Bandcamp image, so no Rich Presence assets need
to be uploaded.

The two activity lines are templates — `{title}`, `{artist}`, `{album}` and `{band}` are
replaced with the current track — and you can choose whether the activity reads
*Listening to*, *Playing* or *Watching*, plus turn the progress bar and the “Listen on
Bandcamp” button on or off.

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
- No analytics and no telemetry. The Last.fm and Discord integrations are opt-in, off
  until you configure them, and only ever receive the track you are currently playing.

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
  discord.ts     Discord Rich Presence client and presence formatting
  lastfm.ts      Last.fm authorisation, now-playing and the scrobble queue
  secrets.ts     keychain-backed sealing for API keys and sessions
  ipc.ts         validated IPC surface and snapshots
src/preload/     contextBridge API
src/renderer/    React UI (pages, components, stores, styles)
src/shared/      shared types and IPC channel names
scripts/         icon generation and UI capture helpers
```

Side A is not affiliated with Bandcamp.
