# Configuration reference

Two files drive every video. Neither requires touching the template source.

| File | Scope |
|---|---|
| `agency.config.json` (engine root) | Your agency identity, shared by every video |
| `projects/<slug>/showcase.config.json` | One website / one video |

Both are validated on load; errors name the exact field. Editors pick up
`schemas/showcase.config.schema.json` for autocompletion (regenerate with `npm run showcase -- schema`).
Paths inside a config file are relative to that file.

## agency.config.json

Your studio, set once and used on every cover and outro. Start from `agency.example.json`; the file
and the `agency/` folder (logo, fonts) are git-ignored.

```json
{
  "name": "Your Studio",
  "logo": "agency/wordmark.png",
  "logoHeight": 84,
  "subtitle": "Web design and development",
  "cta": "Let's build *yours.*",
  "contact": "",
  "accent": "#c8ff32",
  "identity": {
    "display": { "family": "Geist", "files": [] },
    "body": { "family": "Geist", "files": [] },
    "mono": { "family": "Geist Mono", "files": [] },
    "eyebrow": "mono",
    "tracking": "-0.04em"
  }
}
```

| Key | Default | Notes |
|---|---|---|
| `name` | `Your Studio` | Text wordmark when there is no logo |
| `logo` | `null` | SVG or PNG, light artwork on transparent background (the outro is dark) |
| `logoHeight` | `72` | px at 1080 px frame width |
| `subtitle` | `Web Design for Irish Businesses` | Line under the wordmark |
| `cta` | `Let's build *yours.*` | Outro statement. `*word*` = italic serif accent |
| `contact` | `""` | Optional handle/domain under the subtitle |
| `accent` | `#d9a273` | Agency accent (hairline, full stop, outro light, the CTA's italic word) |
| `identity` | `null` | Typefaces: `display` (titles, CTA), `body` (subtitles), `mono` (labels). Each is `{ family, files }`: a bundled Google font (Geist, Geist Mono, Inter Tight, Instrument Serif) with `files: []`, or your own files `[{ "path": "agency/fonts/X-600.woff2", "weight": 600 }]`. `eyebrow`: `spaced` (wide caps) or `mono`. `tracking`: title letter-spacing. `null` = the engine's original type (Inter Tight) |

## showcase.config.json

Minimal valid file:

```json
{ "project": { "name": "Murphy's Bakery", "url": "https://murphysbakery.ie" } }
```

Everything else has a default: the `v3-dynamic` template, automatic walkthroughs, an automatic
(truthful) narration script with the local Kokoro voice, the engine's music bed, subtitles on.

### template

| Key | Default | Notes |
|---|---|---|
| `template` | `v3-dynamic` | `v3-dynamic` = Cinematic Premium V3 (Dynamic Reels), the approved production standard · `v2-stable` = Cinematic Premium V2, the earlier edit (configs without a template written before V3 pin it). See [TEMPLATES.md](TEMPLATES.md) |

The template sets the pacing defaults (`video.timing`, `narration.gapSeconds`), the edit rhythm and the
auto journeys. Any command also takes `--template <id>` as a one-off override.

### project

| Key | Default | Notes |
|---|---|---|
| `name` | required | Client / site name (also the intro title) |
| `url` | `""` | Public or local URL to capture |
| `displayUrl` | `null` | Address-bar domain. `null` = hostname of a public `url`, else the site's `<link rel="canonical">` host |
| `category` | `Web design` | Industry label, used in the eyebrow ("Website · Bakery") |
| `kind` | `website` | `website`, `web-app`, `app` (phone only), `automation` or `branding` (desktop only). Sets the devices, part lengths, cover label and automatic script |
| `accent` | `auto` | `auto` = detected from the site's buttons/links, lifted for legibility on charcoal. Or `#rrggbb` |

### source (where the site comes from)

| Key | Default | Notes |
|---|---|---|
| `serve` | `null` | Static folder (`dist/`, `out/`, plain HTML) served on 127.0.0.1 during capture |
| `start` | `null` | `{ "command": "npm run dev", "cwd": "../site", "url": "http://localhost:5173", "timeoutSeconds": 120 }` started for the capture and stopped after |

If neither is set, `project.url` is loaded directly.

### capture

| Key | Default | Notes |
|---|---|---|
| `startPath` | `""` | Where the walkthrough starts, e.g. `/en` for the English version |
| `devices` | from `kind` | `["desktop", "mobile"]`, `["desktop"]` or `["mobile"]` |
| `auth` | `null` | A saved demo-account session (`showcase login <project>`), relative to the config. Never commit it |
| `hostLabels` | `{}` | Address-bar text for other sites in an automation, e.g. `{ "app.n8n.cloud": "n8n" }` |
| `journeys` | `auto` | The recorded browsing sessions (below) |
| `desktop` | `{ width: 1280, height: 1320, deviceScaleFactor: 2 }` | Desktop browser. The tall window fills a vertical Reel at one fixed scale (no zoom) |
| `mobile` | `{ width: 390, height: 844, deviceScaleFactor: 3 }` | iPhone-class viewport |
| `maxPageHeight` | `14000` | Cap for very long pages (CSS px) |
| `waitForSelector` | `null` | Wait for this element before capturing (SPAs, splash screens) |
| `extraWaitMs` | `600` | Extra settle time after each load |
| `hide` | `[]` | Extra selectors to hide (banners, widgets, staging badges). Consent tools, chat widgets and dev overlays are hidden automatically |
| `blur` | `[]` | Selectors to blur for privacy |
| `sections` | `[]` | Manual sections `{ selector, kind?, label?, focus? }`; empty = automatic detection |

#### journeys

A journey is a real browsing session, run once per viewport. Each step really happens in the browser;
anything that cannot be done (link missing, nothing changes) is skipped with a warning, so nothing is
ever invented. Every page the session reaches is captured in full; every click/tap records the site's
own response frame by frame.

```json
"journeys": {
  "desktop": [
    { "id": "home-scroll", "do": "scroll", "to": "best" },
    { "id": "services", "do": "link", "prefer": "services", "scope": "header" },
    { "id": "services-scroll", "do": "scroll", "to": "best" },
    { "id": "projects", "do": "link", "text": "Projects", "scope": "header" },
    { "id": "projects-scroll", "do": "scroll", "to": "best" }
  ],
  "mobile": [
    { "id": "m-home-scroll", "do": "scroll", "to": "best" },
    { "id": "m-menu", "do": "menu" },
    { "id": "m-service", "do": "link", "prefer": "services", "scope": "menu" },
    { "id": "m-service-scroll", "do": "scroll", "to": "best" },
    { "id": "m-contact", "do": "link", "prefer": "contact", "scope": "page" },
    { "id": "m-contact-scroll", "do": "scroll", "to": "+520" }
  ]
}
```

That is also what `"auto"` does (with the generic desktop link "projects" instead of a named one).

| Step | Fields | What happens |
|---|---|---|
| `scroll` | `to` | `best` (strongest section within ~2 screens), `far` (strongest section further than 1.5 screens), `heading:<text>` (section whose heading contains the text), `section:<kind or id>`, a section selector, `bottom`, `60%`, `+800` (px), `0.5` (fraction), `2400` (px) |
| `cut` | `to` (default `far`) | An edit cut to another part of the same page: the browser really scrolls there, the video cuts (V2: instantly; V3: a 6-frame dissolve and a short drift into place). Must be at least half a screen away |
| `link` | `text` or `prefer` (`services`, `projects`, `about`, `contact`), `depth` (`overview` or `detail`), `via`, `scope` (`header`, `menu`, `page`) | Finds a visible, unobscured internal link and clicks (desktop) / taps (mobile) it. If the link sits in a header dropdown, the dropdown is opened for real first (recorded as its own step `<id>-open`). `via: "Services"` names the dropdown to open; `depth: "detail"` picks a specific page (`/services/welders`) instead of the overview (`/services`, the default) |
| `menu` | | Mobile: taps the menu toggle (found automatically) |
| `click` / `tap` / `hover` | `selector` | A specific element |
| `goto` | `path` | Cut to another page, or to another site with a full URL (automations); the address bar shows that site's host |
| `type` | `selector`, `text` | Type into a real field, recorded keystroke by keystroke. Use demo data only. Follow it with clicks, not scrolls |
| `wait` | `ms` | Capture only: wait (e.g. for an automation run). Nothing is shown |

All steps accept `id` (used by narration anchors and the report) and `label`; actions accept `waitMs`.
Read `capture/report.md` after capturing: it lists every page and step.

### video

| Key | Default | Notes |
|---|---|---|
| `format` | `reel` | `reel` 1080×1920 · `portrait` 1080×1350 · `square` 1080×1080 · `landscape` 1920×1080 |
| `eyebrow` | `auto` | `auto` = `Website · <category>`. Empty string hides it |
| `title` | `null` | Intro title; default the project name. `*word*` = italic accent |
| `cta` | `null` | Override the agency CTA for this video |
| `timing` | from the template: V2 `{ intro: 1.5, desktop: 12.5, mobile: 12.5, outro: 1.5 }`, V3 `{ intro: 1, desktop: 11, mobile: 11, outro: 1.5 }` | Minimum seconds per part (set any subset). Narration can lengthen a part; with music every boundary lands on a beat |
| `balance` | `true` | Desktop and mobile get the same length |
| `cover.enabled` | `false` (`init` sets `true`) | Open on the cover lockup (real desktop + mobile hero, title, agency signature) and export `out/instagram-cover.png` + `instagram-cover-preview.png` |
| `cover.frame` / `cover.time` | `null` | The video frame (or second) used as the cover; default: the lockup's settled frame (22, ~0.7 s) |
| `cover.showAgency` | `true` | Small agency signature under the devices |
| `subtitles` | `true` | Captions under the device (only when there is narration) |
| `output` | `<slug>-showcase.mp4` | File name in `projects/<slug>/out/` |

Inside the desktop and mobile parts, the journey steps share the time by weight (scrolls by distance,
navigation clicks a little longer), and every animation is defined relative to its step. V3 first gives
every click/tap exactly the time its real animation needs, then shares the rest, and nudges untied cuts
and clicks onto the music's beat.

### narration

```json
"narration": {
  "enabled": true,
  "voice": { "provider": "kokoro", "voice": "bf_emma", "speed": 1 },
  "gapSeconds": 0.35,
  "lines": [
    { "id": "intro", "segment": "intro", "text": "Meet Murphy's Bakery." },
    { "id": "desktop-1", "segment": "desktop", "text": "A warm, modern website for a family bakery." },
    { "id": "desktop-2", "segment": "desktop", "step": "menu-open", "text": "Visitors can browse the menu and order ahead in a few clicks." },
    { "id": "mobile-1", "segment": "mobile", "text": "On mobile, everything adapts, with simple navigation." },
    { "id": "outro", "segment": "outro", "text": "Want a website like this for your business?" }
  ]
}
```

| Key | Default | Notes |
|---|---|---|
| `voice.provider` | `kokoro` | `kokoro` (local, no key), `elevenlabs`, `openai`, `azure`. See [NARRATION.md](NARRATION.md) |
| `voice.voice` | per provider | kokoro `bf_emma` · elevenlabs voice id · openai `sage` · azure `en-IE-EmilyNeural` |
| `voice.speed` | `1` | 0.7–1.3 |
| `voice.model`, `voice.instructions` | | Provider model; OpenAI accent/delivery instructions |
| `lines` | `auto` | `auto` builds a script from what the walkthrough actually shows. Each line: `segment` (`intro`, `desktop`, `mobile`, `outro`), `text`, optional `id`, optional `step` (start with that journey step, if it still fits) |
| `gapSeconds` | from the template: V2 `0.35`, V3 `0.25` | Pause between lines |
| `volume` | `1` | Narration gain |

Lines are voiced once and cached by text + voice (`projects/<slug>/narration/`); editing a sentence
re-voices only that sentence. `npm run showcase -- narrate <slug>` voices the script and prints the timeline.

### audio

| Key | Default | Notes |
|---|---|---|
| `music` | `null` | A licensed track you supply (below) |
| `builtinMusic` | `true` | Without a licensed track, use the engine's own synthesised bed (original, cleared for any use) |
| `musicVolume` | `0.32` | Music level between narration lines |
| `duckTo` | `0.12` | Music level while the narrator speaks (smooth 0.25 s dip, 0.45 s recovery) |
| `sfx` | `true` | Subtle click/tap/transition sounds pinned to the picture |
| `sfxVolume` | `0.7` | SFX gain |

```json
"music": {
  "file": "audio/track.mp3",
  "volume": 0.5,
  "startAt": 0,
  "bpm": "auto",
  "offset": 0,
  "beatSync": true,
  "licence": {
    "title": "Track title", "artist": "Artist",
    "source": "https://library.example/track/123",
    "licence": "Library commercial licence", "licenceUrl": "https://library.example/licence",
    "proof": "audio/licence-certificate.pdf", "clearedForAds": false
  }
}
```

With music, `render` also outputs `<name>-no-music.mp4` (narration + SFX only).

### agency

Per-video overrides of `agency.config.json`, only for the keys you set, e.g.
`"agency": { "cta": "Your table is *ready.*" }`.

### brief

The answers from the `/showcase` interview (goal, audience, highlights, tone, notes). They don't
change the render; they let the video be remade the same way.

```json
"brief": { "goal": "Portfolio piece", "highlights": ["Bread menu", "Visit us"], "tone": "Confident and warm" }
```
