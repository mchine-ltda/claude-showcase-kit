# Capture pipeline

`npm run showcase -- capture <slug>` drives Chromium through Playwright and records two real browsing
sessions (journeys), desktop and mobile, into `projects/<slug>/capture/`.

## Inputs

| Input | How |
|---|---|
| Public URL | `project.url` |
| Local URL | `project.url` = `http://localhost:…` (site already running) |
| Static build | `source.serve` = folder with `index.html`; served on `127.0.0.1` with clean-URL and SPA fallback |
| Dev command | `source.start` = `{ command, cwd, url }`; started, polled until it answers, stopped after |
| Manual fallback | `showcase import <slug> --desktop full.png --mobile full.png [--desktop-recording a.mp4]` |

The walkthrough starts at `project.url` + `capture.startPath` (e.g. `/en`). A 4xx/5xx response aborts
the capture: an error page is never captured as if it were the website.

## One session per viewport

Desktop 1280×1320 @2x, mobile 390×844 @3x (iPhone UA, touch). Fresh context: no cookies, storage,
service workers or credentials; `en-IE`, Europe/Dublin.

On every page the session reaches:

1. Wait for load, network idle (bounded), fonts and `waitForSelector`.
2. Sanitise: no smooth scrolling, scrollbars or caret; hide dev overlays (Vite, Next.js, Astro, Nuxt,
   Vercel toolbar), consent tools, chat widgets, reCAPTCHA badge, WP admin bar, plus `capture.hide`;
   hide consent/newsletter popups and modal dialogs; blur `capture.blur`.
3. Scroll through so lazy images and reveal-on-scroll content load; wait for every image to decode.
4. Detect the pinned header (fixed/sticky, still pinned after scrolling), capture it alone (opaque).
5. Analyse sections (kind, score, main block, heading) and the colour at the top of the page.
6. Freeze animations, hide the header and floating UI, capture the page in 1600 px PNG tiles, then
   restore everything so the session can keep interacting.

Then each journey step really happens (see [CONFIGURATION.md](CONFIGURATION.md#journeys)):

- **scroll**: the session scrolls; the film renders the scroll from the tiles (smooth and sharp).
- **click / tap / hover / link / menu**: the target is brought into view the way a visitor would, the
  "before" state and (desktop) the hovered state are captured, then the site's CSS/WAAPI motion is slowed
  12× through the DevTools Animation domain while the action runs and intermediate screenshots are
  taken. If the URL changes, the new page is settled and captured in full. If nothing changes at all,
  the step is dropped: nothing is invented.
- Header dropdowns: a `link` step whose link is hidden in a dropdown opens it for real first
  (`via: "Services"` names the dropdown; `depth: "detail"` picks a specific page inside it).
- **cut**: the session really scrolls to another section of the same page (`far`, `heading:<text>`, …);
  the film shows it as an edit cut instead of a scroll. Later actions are captured at that position.
- **goto**: a cut to another page, or to another site with a full URL (automations). Pages on another
  site keep their host, which the address bar shows (rename it with `capture.hostLabels`).
- **type**: the field is clicked or tapped and the text is typed for real, screenshotted as it appears.
  Use demo data only.
- **wait**: the session pauses (e.g. while an automation runs); nothing is shown.

### Behind a login

`showcase login <project> --url <app>` opens a visible Chrome window. You sign in with a **demo
account** (and open tabs for every other tool an automation touches), then close the window. The
session is saved to `projects/<project>/auth/session.json` and `capture.auth` points to it, so the
capture runs signed in. The engine never sees or types a password. Delete the session when the
video is done, and blur anything personal (`capture.blur`).

Targets are the text of the link/button (where a cursor or finger would go), not the middle of a wide row.

## Brand

Accent colour voted from buttons/links/highlights, page background, text colour, heading font, title,
description and the canonical domain (`<link rel="canonical">`), used for the address bar.

## Output

```
capture/
  manifest.json                       ← everything the template reads (see src/types.ts)
  report.md                           ← pages, steps, sections, brand, warnings
  desktop/p0/header.png, tile-00.png …  one folder per visited page
  desktop/steps/<id>/before.jpg, hover.jpg, f1.jpg …, after.jpg
  mobile/…
```

## Known limits

- Sites that scroll inside a container (some smooth-scroll libraries) capture as one screen. Use a
  static build, disable the library for the capture URL, or the manual fallback.
- Content behind a login is only captured through a demo-account session you create yourself with `showcase login`, or from sanitised screenshots and recordings (`import`).
- JS-driven animations not exposed as CSS/WAAPI (e.g. canvas, rAF loops) are captured as their before
  and after states.
