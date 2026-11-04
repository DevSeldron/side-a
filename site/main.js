const REPO = 'DevSeldron/side-a'

const versionTargets = document.querySelectorAll('[data-version]')
const versionChip = document.querySelector('[data-version-chip]')
const notesBody = document.querySelector('[data-release-notes]')

const ASSET_MATCHERS = {
  dmg: (name) => name.endsWith('-arm64.dmg'),
  'mac-zip': (name) => name.endsWith('-arm64-mac.zip'),
  exe: (name) => name.endsWith('-win-x64.exe'),
  'win-zip': (name) => name.endsWith('-win-x64.zip')
}

function fileSize(bytes) {
  if (!bytes) return ''
  const megabytes = bytes / (1024 * 1024)
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)} MB`
}

function renderNotes(markdown) {
  if (!notesBody) return
  notesBody.replaceChildren()
  const lines = markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`]/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return
  let list = null
  for (const line of lines) {
    if (/^[-*]\s+/.test(line)) {
      if (!list) {
        list = document.createElement('ul')
        notesBody.append(list)
      }
      const item = document.createElement('li')
      item.textContent = line.replace(/^[-*]\s+/, '')
      list.append(item)
      continue
    }
    list = null
    const paragraph = document.createElement('p')
    paragraph.textContent = line
    notesBody.append(paragraph)
  }
}

async function hydrateRelease() {
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' }
    })
    if (!response.ok) return
    const release = await response.json()
    const version = String(release.tag_name ?? '').replace(/^v/, '')
    if (!version) return

    versionTargets.forEach((element) => {
      element.textContent = version
    })
    if (versionChip) versionChip.textContent = version

    const assets = Array.isArray(release.assets) ? release.assets : []
    for (const [key, matches] of Object.entries(ASSET_MATCHERS)) {
      const asset = assets.find((entry) => matches(entry.name))
      if (!asset) continue
      document.querySelectorAll(`[data-download="${key}"]`).forEach((link) => {
        link.href = asset.browser_download_url
      })
      document.querySelectorAll(`[data-size="${key}"]`).forEach((element) => {
        element.textContent = fileSize(asset.size)
      })
    }

    renderNotes(String(release.body ?? ''))
  } catch (error) {
    // Offline, rate-limited or blocked: the static links still go to Releases.
  }
}

function wirePlatform() {
  const platform = `${navigator.userAgentData?.platform ?? navigator.platform ?? ''} ${navigator.userAgent}`
  const isMac = /mac/i.test(platform)
  const isWindows = /win/i.test(platform)
  const label = isMac ? 'Download for macOS' : isWindows ? 'Download for Windows' : 'See downloads'
  document.querySelectorAll('[data-hero-cta]').forEach((element) => {
    element.textContent = label
  })
  const meta = document.querySelector('[data-platform-label]')
  if (meta) {
    if (isMac) meta.textContent = 'macOS 12+ · Apple silicon'
    else if (isWindows) meta.textContent = 'Windows 10+ · 64-bit'
  }
}

function wireCopyButtons() {
  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const value = button.getAttribute('data-copy') ?? ''
      const original = button.textContent
      try {
        await navigator.clipboard.writeText(value)
        button.textContent = 'Copied'
      } catch (error) {
        button.textContent = 'Select'
      }
      window.setTimeout(() => {
        button.textContent = original
      }, 1600)
    })
  })
}

function wireMenu() {
  const toggle = document.querySelector('.menu-toggle')
  const menu = document.getElementById('mobile-menu')
  if (!toggle || !menu) return
  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open))
    menu.hidden = !open
  }
  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true')
  })
  menu.addEventListener('click', (event) => {
    if (event.target instanceof HTMLAnchorElement) setOpen(false)
  })
}

function wireScrollState() {
  const nav = document.querySelector('.nav')
  if (!nav) return
  const update = () => nav.classList.toggle('is-scrolled', window.scrollY > 8)
  update()
  window.addEventListener('scroll', update, { passive: true })
}

function wireReveals() {
  const targets = document.querySelectorAll(
    '.feature, .download-card, .split-copy, .discover-demo, .notes-body, .faq-list details, .cta-inner'
  )
  if (!('IntersectionObserver' in window)) return
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
  )
  targets.forEach((target, index) => {
    target.classList.add('reveal')
    target.style.transitionDelay = `${Math.min(index % 4, 3) * 60}ms`
    observer.observe(target)
  })
}

wirePlatform()
wireCopyButtons()
wireMenu()
wireScrollState()
wireReveals()
void hydrateRelease()
