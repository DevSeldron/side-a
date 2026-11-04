# Side A site

Static marketing and download page for Side A. No build step, no dependencies — upload
the contents of this folder to any static host (GitHub Pages, Netlify, Vercel, S3,
Cloudflare Pages, or a folder on your own server).

```
site/
├── index.html
├── styles.css
├── main.js
└── assets/
    ├── icon.png
    ├── icon.svg
    └── fonts/
```

## What it does

- Reads the latest GitHub release from `api.github.com` and fills in the version, asset
  sizes and download links. Without JavaScript — or if the API is rate-limited — every
  download button still points at the Releases page.
- Picks the hero button label from the visitor's platform (macOS, Windows, or "See
  downloads" elsewhere).
- Includes a copy button for the `xattr` command, a mobile menu, and scroll reveals that
  respect `prefers-reduced-motion`.

## Local preview

```bash
python3 -m http.server 4173 --directory site
```

## Deploying

Copy the folder as-is; all paths are relative so it works from a subdirectory too. The
only external requests are the GitHub API call and the links to GitHub itself, so the page
works on any origin. To point it at a different repository, change `REPO` at the top of
`main.js` and the `github.com/DevSeldron/side-a` links in `index.html`.
