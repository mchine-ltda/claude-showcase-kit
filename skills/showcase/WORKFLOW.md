# Workflow: a showcase Reel from any repository

`SC` = `node "${CLAUDE_SKILL_DIR}/scripts/showcase.mjs"` (in a terminal:
`node "$HOME/.claude/skills/showcase/scripts/showcase.mjs"`). Run it from the work's repository;
everything it writes goes to the engine's `projects/<slug>/`. The repository is read, never written.

Start with the presenter-format question in [SKILL.md](SKILL.md). For on-camera presenter mode,
follow [PRESENTER.md](PRESENTER.md) for the prompt and wait for usable footage before project setup,
capture and previews. The remaining steps apply once the recording is ready.

## 0. Check the engine

```bash
SC where      # engine folder and version, skill folder
SC doctor     # capture browser, ffmpeg, sound effects, projects
SC voices     # kokoro ready; cloud voices only with their key in the environment
SC portfolio  # what is already rendered and published
```

## 1. Inspect (read-only)

Read, don't run:
- `package.json` (framework and scripts);
- the build output (`dist/`, `build/`, `out/`);
- the README;
- the deploy config (`vercel.json`, `netlify.toml`);
- the routes;
- canonical links.

Then by kind:

| Kind | Look for |
|---|---|
| website | Pages, header nav (links vs dropdown triggers and their labels), mobile menu, contact, strongest home sections (galleries, work, process) |
| web-app | The main screens (dashboard, list, detail, settings), one real action with a visible result, whether there is a demo account, what personal data appears |
| app | Whether it runs on the web (Expo web, PWA) at phone size; otherwise ask for a screen recording of the simulator or device |
| automation | Trigger, every app it touches, where the result is visible (inbox, sheet, CRM, Slack), whether a test run is safe to trigger (it must not email real customers) |
| branding | The guidelines document (e.g. a brand book HTML or PDF exported to HTML), the brand site, logo files; the sections worth showing |

## 2. Interview, round 1 (AskUserQuestion)

Ask what we are showcasing (the detected kind is Recommended), what the post is for, where to record
it, and which devices. See SKILL.md for the exact questions.

## 3. Create the project

```bash
SC init <slug> --kind website --url https://client.ie --name "Client Name" --category "Restaurant" --start-path /en
```

| Source | Flag | When |
|---|---|---|
| Deployed site | `--url https://client.ie` | It is live and current (a 404 aborts capture) |
| Static build | `--serve dist` | A build folder exists. Served read-only on 127.0.0.1 |
| Dev server | `--start "npm run dev" --start-url http://localhost:5173 --cwd .` | Only with permission |
| Recordings | `import <slug> --desktop full.png --mobile-recording app.mp4` | Not reachable, or a native app |

`init` writes `projects/<slug>/showcase.config.json` with:
- the approved template (`v3-dynamic`);
- the kind and its timing;
- `video.cover.enabled: true`.

## 4. Script the walkthrough (`capture.journeys`)

Give every step an `id`, so narration can be tied to it.

**Website** (desktop, then mobile):

```json
"desktop": [
  { "id": "home-scroll", "do": "scroll", "to": "best" },
  { "id": "work-cut", "do": "cut", "to": "heading:<section heading>" },
  { "id": "service", "do": "link", "text": "<Service>", "via": "<Dropdown label>" },
  { "id": "service-scroll", "do": "scroll", "to": "+760" },
  { "id": "projects", "do": "link", "text": "<Projects link>" },
  { "id": "projects-scroll", "do": "scroll", "to": "+420" }
],
"mobile": [
  { "id": "m-home-scroll", "do": "scroll", "to": "+520" },
  { "id": "m-menu", "do": "menu" },
  { "id": "m-service", "do": "link", "text": "<Service>", "scope": "menu" },
  { "id": "m-service-scroll", "do": "scroll", "to": "+460" },
  { "id": "m-contact", "do": "link", "prefer": "contact", "scope": "page" },
  { "id": "m-contact-scroll", "do": "scroll", "to": "+560" }
]
```

**Web app:** sign in first (step 5). Then open the dashboard, click into a record, do one real action
(filter, create, update) and show its result. Use `click` / `type` with selectors and `link` for the
sidebar.

**App:** `"devices": ["mobile"]`. Follow the main flow: home, a tab, one action and its result.

**Automation:** `"devices": ["desktop"]`. Trigger it for real with demo data, then cut through each app
it touches (see [automation.config.example.json](automation.config.example.json)):

```json
"desktop": [
  { "id": "form", "do": "goto", "path": "https://client.ie/contact" },
  { "id": "name", "do": "type", "selector": "#name", "text": "Aoife Byrne" },
  { "id": "email", "do": "type", "selector": "#email", "text": "aoife@example.com" },
  { "id": "send", "do": "click", "selector": "button[type=submit]" },
  { "id": "run", "do": "wait", "ms": 6000 },
  { "id": "workflow", "do": "goto", "path": "https://app.n8n.cloud/workflow/123/executions" },
  { "id": "inbox", "do": "goto", "path": "https://mail.google.com/mail/u/0/#inbox" },
  { "id": "crm", "do": "goto", "path": "https://crm.example.com/leads" }
]
```

- The address bar shows each site's real host. Rename hosts with
  `"hostLabels": { "app.n8n.cloud": "n8n" }`.
- After `type`, use clicks rather than scrolls: the typed state lives in the recorded frames.

**Branding:** `"devices": ["desktop"]`. Serve the guidelines folder (`--serve brand-kit/output`) and
alternate `scroll` and `cut` through logo, palette, typography and applications. `"auto"` does this
by itself.

Other settings:
- `project.displayUrl`: the real domain when capturing a local build.
- `capture.hide`: cookie banners, chat widgets, staging badges.
- `capture.blur`: personal data.

## 5. Demo accounts (web apps, automations)

```bash
SC login <slug> --url https://app.example.com
```

Chrome opens. **The user** signs in with a demo account (and opens tabs for every other tool the
automation touches), then closes the window. The session is saved to `projects/<slug>/auth/` and
`capture.auth` points to it. Never type passwords yourself; never commit the session.

## 6. Capture

```bash
SC capture <slug>                 # every device of the kind
SC capture <slug> --only desktop  # redo one device
```

Read `projects/<slug>/capture/report.md`: every step is listed, and skipped steps appear under
Warnings with the reason. Open a few `capture/*/steps/*/after.jpg` and check:
- no banners;
- no private data;
- the intended pages.

## 7. Interview, round 2, then the narration

Ask what to highlight (real features you found, as options), the tone, the voice and the closing
line. Then write `narration.lines`: 7–8 short lines, about 20 s of speech.

For presenter mode the story questions were answered before capture. Use the verified recorded script
and local `presenter.video`, and skip generated-voice selection.

| Part | Example |
|---|---|
| intro | "Meet <Client>." |
| walkthrough | An opener · one line per highlight, tied to its step (`"step": "<id>"`) · a short closer |
| outro | "Want a <noun> like this for your business? Send us a message." |

```bash
SC narrate <slug>
```

This prints timings for the generated or recorded narration. For the standard voice-over, target
25–28 s with equal time on desktop and mobile. For the presenter, budget around the actual speech
and distribute walkthrough time by the lines and actions on each device.

## 8. Review, interview round 3

```bash
SC still <slug>    # one still per step, in out/stills/
SC cover <slug>    # out/instagram-cover.png + instagram-cover-preview.png
SC grid <slug>     # projects/portfolio-grid.png: the profile with this post first, plus checks
```

Send the cover preview and the grid to the user with a storyboard table. Ask "Render it?" (Render ·
Change the script · Change the walkthrough).

## 9. Render

```bash
SC render <slug>
```

Takes a few minutes, so run it in the background. It writes to `projects/<slug>/out/`:

| File | |
|---|---|
| `<slug>-showcase.mp4` | 1080×1920, 30 fps, H.264 + AAC 48 kHz, Reels-ready |
| `instagram-cover.png` | The exact cover frame, 1080×1920 PNG |
| `instagram-cover-preview.png` | 9:16 with safe area, 3:4 and 1:1 grid crops, phone grid row |
| `qa/report.md`, `qa/contact-sheet.png` | QA results and review frames |

The post is recorded as a draft in `projects/portfolio.json`.

## 10. Validate and deliver

Read `out/qa/report.md` and fix every FAIL. It checks:
- format and duration;
- black frames, freezes and unexpected jumps;
- desktop/mobile balance and narration placement;
- voice above music (measured on stems);
- loudness and true peak;
- the cover frame matching the video.

Report the files, the walkthrough, the script and voice, the QA result and the grid check. When the
user says it is posted:

```bash
SC portfolio publish <slug> --url https://www.instagram.com/reel/...
```

Finally, run `git status` in the work's repository: it must be unchanged.
