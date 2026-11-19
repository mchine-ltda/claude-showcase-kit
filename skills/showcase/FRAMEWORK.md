# Framework

The Claude Showcase Kit is a standalone TypeScript application (Remotion + Playwright + TTS) that
turns real digital work into a narrated Instagram Reel and its cover. One kit serves every
repository on the computer; each video is a project folder inside it. The `/showcase` skill only
locates and drives it.

- **Location:** the folder in `engine.json` next to this file (`SHOWCASE_ENGINE_DIR` overrides it).
- **Version:** 4.0.0, which adds project kinds, agency identity, the interview, the portfolio grid
  and the `/showcase` skill.
- **Template:** `v3-dynamic`, Cinematic Premium V3, the approved production standard.

## Pipeline

```
 the work (URL / static build / dev server / recordings)  [+ demo-account session from `login`]
   └─ capture (Playwright journeys) ──► projects/<slug>/capture/  page tiles, step frames, manifest.json, report.md
 script (narration.lines, from the interview)
   └─ narrate (TTS, cached per line) ──► projects/<slug>/narration/  levelled takes
 agency.config.json (identity) + showcase.config.json (kind, brief) + manifest + takes
   └─ stage ──► .stage/<slug>/  public assets + props.json (the exact render input)
        └─ Remotion "Showcase" (src/, never edited per project)
             cover lockup → walkthrough (desktop and/or mobile) → outro
             + subtitles + narration + ducked music + SFX
        └─ render ──► out/<slug>-showcase.mp4
        └─ cover  ──► out/instagram-cover.png (+ grid-crop preview)
        └─ qa     ──► out/qa/ report, contact sheet, stem mix
        └─ portfolio ──► projects/portfolio.json (draft) ──► grid ──► projects/portfolio-grid.png
```

## Layout

| Path | What |
|---|---|
| `engine/cli.ts` | CLI: `init`, `login`, `capture`, `import`, `narrate`, `still`, `cover`, `preview`, `render`, `qa`, `mix`, `compare`, `grid`, `portfolio`, `templates`, `voices`, `doctor`, `skill:install` |
| `engine/capture/` | Playwright capture: journeys (`journey.ts`: scroll, cut, link, menu, click/tap/hover, type, goto, wait), in-page scripts, static server, manual import |
| `engine/config/` | Config schemas (zod), project kinds (`kinds.ts`), loading, prop resolution |
| `engine/narration/` | TTS providers (Kokoro local, ElevenLabs, OpenAI, Azure) and take mastering |
| `engine/audio/` | WAV I/O, the engine's music bed and SFX synthesis, beat analysis |
| `engine/render/` | Staging, Remotion wrappers, cover export |
| `engine/qa/` | QA, stem mix measurement, render comparison |
| `engine/portfolio.ts` | The post registry and the profile-grid preview |
| `src/` | The Remotion template: `Showcase.tsx`, `timeline.ts`, `templates.ts`, scenes (`CoverIntro`, `WalkthroughScene`, `OutroScene`), components, theme (`identity.tsx`) |
| `public/engine/` | The engine's music bed and SFX (original, cleared for commercial use) |
| `skills/showcase/` | This skill (installed by `install.sh` / `install.ps1` / `skill:install`) |
| `projects/` | Your projects. Private: only the demo's config is in git |
| `agency.config.json`, `agency/` | Your agency identity, logo and fonts. Private |

## Dependencies

- Node ^20.19 / ^22.13 / ≥ 24.
- Remotion 4.0.539, with its bundled ffmpeg.
- Playwright, using installed Chrome or Edge, or `npx playwright install chromium`.
- `kokoro-js`: the Kokoro-82M model, downloaded once to `.cache/models` (~330 MB).
- zod 4, tsx, React 19.
- No system ffmpeg, Python or GPU.

## Capture

One real browser session per device (desktop 1280×1320 at 2×, mobile 390×844 at 3×):

- **Sessions:** fresh profiles, or a saved demo-account session (`capture.auth`, from `login`).
- **Every page reached is captured in full:**
  - lazy content is loaded and overlays hidden;
  - the pinned header is captured on its own;
  - sections are analysed;
  - the page is stored as 1600 px tiles.

  Pages on another site keep their host for the address bar.
- **Every click, tap, hover or typing step records the work's own response:**
  - CSS/WAAPI animations are slowed 12× and sampled;
  - typing is captured keystroke by keystroke.
- **Nothing is invented.** Actions that change nothing are dropped. An HTTP error page aborts the
  capture.

## Composition

- **`Showcase`:** a `TransitionSeries` of cover/intro, walkthrough scenes and outro, over one
  persistent stage light, with subtitles and the soundtrack on top. A `TypeProvider` gives every scene
  the agency's typefaces.
- **`templates.ts`:** frozen pacing tables. `v3-dynamic` is the default; `v2-stable` is kept so older
  videos re-render identically. A published template never changes; a new idea is a new id.
- **`timeline.ts`:** the single source of timing.
  - It budgets each part from its narration, balances desktop and mobile (or gives a single-device
    kind one long part), and snaps boundaries to the beat.
  - It places narration first, then plans steps around the lines tied to them.
  - It picks the cover frame.
- **Determinism:** every frame is a pure function of props and frame. Chrome adds ≤ 2/255 raster
  noise, so MP4 bytes differ between renders; `compare` checks renders by content.

## Audio

- **Narration:** each line is voiced once (cached), trimmed, levelled to −18 dBFS RMS and
  soft-limited.
- **Music:** the engine's bed, or a licensed file with its licence recorded. Ducked under every line.
- **SFX:** frame-pinned to presses, part changes, cuts and the signature.
- **QA stems:** voice-only and music+SFX-only renders measure the real separation (≥ 8 dB required).

## Render and QA

`render`:
- stages the project, then renders H.264 CRF 16, yuv420p, BT.709, AAC 320k at 48 kHz, faststart;
- exports the cover (a lossless still of the same composition and props);
- renders the stems, runs QA and records the post.

QA checks:
- **format:** container, codec, resolution, fps, duration, bitrate, audio;
- **structure:** balance, pacing, fixed desktop scale, narration placement and overlap;
- **picture:** black frames, freezes, abrupt jumps (page changes and cuts are expected);
- **sound:** loudness, true peak, voice above music;
- **cover:** the cover frame, the export and its match with the MP4;
- review frames and a contact sheet.
