# Config example

Two complete, valid project configs for a fictional bakery:

- [`showcase.config.example.json`](showcase.config.example.json): a **website** (desktop + mobile);
- [`automation.config.example.json`](automation.config.example.json): an **automation** (desktop
  only), with a demo-account login, typing, a wait and cuts across three sites.

`init` writes a similar file to `<engine>/projects/<slug>/showcase.config.json`; copy the parts you
need from the examples. Every option is listed in [reference.md](reference.md).

## Website

```json
"project": {
  "name": "Murphy's Bakery",
  "url": "https://murphysbakery.ie",
  "displayUrl": "murphysbakery.ie",
  "category": "Artisan bakery",
  "kind": "website",
  "accent": "auto"
}
```

- `url`: what to capture. Alternatively use `source.serve` (a static build folder) or `source.start`
  (a dev server command + URL), with paths relative to the config file.
- `displayUrl`: what the browser's address bar shows. Set it when capturing from localhost.
- `category`: the eyebrow shows "Website · Artisan bakery".
- `kind`: `website`, `web-app`, `app`, `automation` or `branding`. It sets the devices, the default
  part lengths, the cover label ("Automation · Bakery") and the automatic script.
- `accent`: `auto` takes the site's brand colour. A hex such as `#c2603a` overrides it.

## Pages and interactions

```json
"capture": {
  "startPath": "",
  "journeys": {
    "desktop": [
      { "id": "home-scroll", "do": "scroll", "to": "best" },
      { "id": "bakes-cut", "do": "cut", "to": "heading:Baked this morning" },
      { "id": "menu-item", "do": "link", "text": "Sourdough", "via": "Our bread" },
      { "id": "menu-scroll", "do": "scroll", "to": "+760" },
      { "id": "visit", "do": "link", "text": "Visit us" },
      { "id": "visit-scroll", "do": "scroll", "to": "+420" }
    ],
    "mobile": [ "…menu, a page, a scroll, contact, the form…" ]
  },
  "hide": ["#cookie-banner", ".chat-widget"],
  "blur": [".staff-phone"]
}
```

| Step | Meaning |
|---|---|
| `scroll` | A real scroll. `to`: `best` (strongest section within ~2 screens), `+760` (px), `heading:<text>`, `bottom`, `60%` |
| `cut` | An edit cut to another section of the same page: `far` (strongest section further down) or `heading:<text>` |
| `link` | Click/tap a real link by `text` or `prefer` (`services`, `projects`, `about`, `contact`). `via` opens a header dropdown first and records it as step `<id>-open`. `scope`: `header` (default), `menu` (mobile menu), `page` |
| `menu` | Mobile: tap the menu toggle |
| `click` / `tap` / `hover` | A specific element by `selector` |
| `goto` | Cut to another page, or to another site with a full URL (automations). The address bar shows that site's host |
| `type` | Type into a real field: `selector` and `text`, typed keystroke by keystroke. Demo data only |
| `wait` | Capture only: wait `ms` (e.g. for an automation run to finish). Nothing is shown |

- `startPath`: start at `/en` for a multilingual site.
- `devices`: `["desktop", "mobile"]`, `["desktop"]` or `["mobile"]`; default from the kind.
- `auth`: a saved demo-account session from `showcase login` (web apps, automations). Never commit it.
- `hostLabels`: what the address bar shows for other sites, e.g. `{ "app.n8n.cloud": "n8n" }`.
- `hide`: remove cookie banners, chat widgets and staging badges from the capture.
- `blur`: anything personal.

## Video, colours, cover and output

```json
"video": {
  "format": "reel",
  "eyebrow": "auto",
  "title": "Murphy's *Bakery*",
  "cta": null,
  "timing": { "intro": 1, "desktop": 11, "mobile": 11, "outro": 1.5 },
  "balance": true,
  "subtitles": true,
  "cover": { "enabled": true, "frame": null, "time": null, "showAgency": true },
  "output": "murphys-bakery-showcase.mp4"
}
```

- `title`: the cover and intro title. `*word*` sets that word in the italic accent face. Keep it to
  the name or a 2–3 word project title.
- `cta`: overrides the agency's outro line for this video.
- `timing`: minimum seconds per part. Narration can lengthen a part, and the music beat rounds it.
- `cover`: the opening lockup and `instagram-cover.png`.
  - `frame` / `time`: pick another settled frame (default: frame 22, ~0.7 s).
  - `showAgency`: shows the small agency signature.
- `output`: the file name in `out/`.

## Narration

```json
"narration": {
  "voice": { "provider": "kokoro", "voice": "bf_emma", "speed": 1 },
  "gapSeconds": 0.25,
  "lines": [
    { "id": "intro", "segment": "intro", "text": "Meet Murphy's Bakery." },
    { "id": "desktop-2", "segment": "desktop", "step": "menu-item-open", "text": "Visitors open the bread menu and go straight to today's loaves." }
  ]
}
```

- `segment`: the part the line belongs to (`intro`, `desktop`, `mobile`, `outro`).
- `step`: start that journey step with the line. `menu-item-open` is the dropdown opening recorded
  by the `menu-item` link with `via`.
- `voice`: keep Kokoro `bf_emma` at speed 1 for the approved identity. A cloud provider needs its key
  in the environment, never in this file.

## The brief

```json
"brief": { "goal": "Portfolio piece", "highlights": ["Bread menu", "Visit us page"], "tone": "Confident and warm" }
```

These are the interview's answers. They don't change the render; they let anyone remake the video the
same way.

## Audio and branding

- `audio`:
  - `music: null` with `builtinMusic: true` uses the engine's cleared bed;
  - a licensed track goes in `music: { "file": "...", "licence": { ... } }`;
  - `musicVolume` and `duckTo` are the approved levels.
- `agency`: per-video overrides of the engine's `agency.config.json` (name, logo, subtitle, cta,
  contact, accent, identity). Leave it `{}` to use the agency defaults.
- The agency's look lives in `agency.config.json` (start from `agency.example.json`):
  - name, logo (a transparent PNG/SVG), the outro line and the accent;
  - `identity`: the typefaces for titles, subtitles and labels, either bundled Google fonts (Geist,
    Geist Mono, Inter Tight, Instrument Serif) or your own font files. Keep licensed font files out of
    public repos.
- `$schema`: points from `projects/<slug>/` to the engine's JSON schema, for editor autocompletion.
