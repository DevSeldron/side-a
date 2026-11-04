# Side A site

Static marketing and download page for Side A. No build step and no dependencies. Upload the
contents of this folder to any static host, or let the Pages workflow do it.

```
site/
├── index.html
├── styles.css
├── main.js
└── assets/
    ├── icon.png
    ├── icon.svg
    ├── fonts/
    │   └── inter.woff2
    └── screens/
        ├── collection.png
        ├── album.png
        ├── now-playing.png
        ├── discover.png
        └── welcome.png
```

## What it does

- Reads the latest GitHub release from `api.github.com` and fills in the version, asset sizes
  and download links. Without JavaScript, or if the API is rate limited, every download button
  still points at the Releases page.
- Includes a copy button for the `xattr` command, a mobile menu, and release notes.
- Uses Inter from `assets/fonts/`, so the page makes no font requests to third parties.

## Screenshots

The files in `assets/screens/` are real captures of the running Electron app. Rebuild the app,
then run:

```bash
npm run build
node scripts/capture-site.mjs
node scripts/capture-welcome-site.mjs
```

Each capture opens the app with an isolated user data folder, resizes the window to 1440 by 900
and writes a 2x PNG. Resize those PNGs to 1600 pixels wide before committing them.

## Local preview

```bash
python3 -m http.server 4173 --directory site
```

## Deploying

`.github/workflows/pages.yml` deploys this folder to GitHub Pages on every push that touches
`site/`. `site/CNAME` holds `sidea.devseldron.xyz`; point a `CNAME` record for that subdomain at
`devseldron.github.io`. The workflow can also be started by hand from the Actions tab.

Anywhere else, copy the folder as is. All paths are relative, so it works from a subdirectory
too. The only external requests are the GitHub API call and the links to GitHub itself.
