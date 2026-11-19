---
name: showcase
description: Turn real digital work (a website, web app, mobile app, automation or brand identity) into a narrated, cinematic Instagram Reel and Instagram cover with the Claude Showcase Kit. Ask whether the user wants an on-camera presenter or a voice-over-only Reel. In presenter mode, write a recording or avatar-generation prompt and wait for their footage before editing. Use for showcase videos, portfolio Reels, Instagram covers, case studies and promos of real projects.
when_to_use: Requests like "make a showcase of this", "Instagram reel for this project", "portfolio video for this site/app/automation/brand", "/showcase", "/showcase https://client.ie".
argument-hint: "[URL, project name or notes]"
allowed-tools: Bash(node "${CLAUDE_SKILL_DIR}/scripts/showcase.mjs" *)
---

# Showcase

Make a premium portfolio Reel of the work in the current repository with the **Claude
Showcase Kit** engine. The engine is a separate application (its folder is in `engine.json` next to
this file). It owns the template, capture, voice, music, cover, QA and the portfolio registry. This
repository only provides the work. **Never copy the engine into this repo. Never modify this repo**
(no edits, installs, builds, commits or generated files) unless the user explicitly authorises a
specific change.

Arguments: `$ARGUMENTS` (a URL, the client's name, the kind of project or notes; may be empty).

## Choose the presenter format

Before capture or production, ask “How would you like the Reel presented?” in the user’s language.
Use AskUserQuestion if available, otherwise ask in chat. If the user already made an explicit choice,
use it and continue.

- **Voice-over only (Recommended)** — Use the existing generated narration and device walkthrough.
- **On-camera presenter** — Use the person or avatar's recording for the narration. Show them in the
  opening and closing cards, with the real walkthrough and their voice in between.

Wait for the choice. For **voice-over only**, continue through the usual interview and workflow.
For **on-camera presenter**, read [PRESENTER.md](PRESENTER.md) and prepare the recording brief first.
Use read-only inspection to ground the walkthrough and script. Deliver the copy-ready recording or
generation prompt and wait for the footage before initialising the project, recording the walkthrough
or rendering previews. If the user already supplied usable presenter footage, inspect it and confirm
its spoken script against the walkthrough before proceeding.

## The engine

Run every engine command through the bundled launcher, from any directory:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/showcase.mjs" <command> [options]
```

Below, `SC` means exactly that prefix. Start with `SC where`, `SC doctor` and `SC voices`. If the
engine is missing or has no dependencies, follow [INSTALLATION.md](INSTALLATION.md) and stop until it
works. Relative paths you pass resolve against the directory you run it from. Projects live in the
engine's `projects/<slug>/`, and they are private: never commit or upload them.

## One idea for everything

Every kind of work is shown the same way: **a real recorded session of the real thing**, in the
same cinematic frame, in the same order.

1. **Cover lockup**, about 1.2 s. Its settled frame is the Instagram cover.
2. **Walkthrough**: real scrolling, clicks, typing and page changes.
3. **Outro**: the agency signature.

Narration, subtitles, ducked music and subtle sound effects run throughout. The kind only changes
what is recorded:

| Kind | What the walkthrough shows | Devices (default) |
|---|---|---|
| `website` | Home, a strong section, menu, a service/product page, projects, mobile menu, contact | Desktop ~11 s + mobile ~11 s |
| `web-app` | Dashboard, opening a record, a real action and its result, the responsive view | Desktop + mobile |
| `app` | The app on a phone: home or onboarding, the main flow, a real action | Mobile ~20 s |
| `automation` | The trigger (a form, an email, a new row), the workflow running, the result in each app, joined by cuts | Desktop ~20 s |
| `branding` | The brand guidelines or brand site: logo, palette, type, applications, with cuts | Desktop ~20 s |

The template and the agency's identity define the look. See [STYLE-GUIDE.md](STYLE-GUIDE.md).
Adapt the walkthrough, narration and the presenter's framing to the material.

## The interview

Ask before you decide. Use the **AskUserQuestion** tool for every round:

- up to 4 questions a round, with 2–4 short options each;
- the recommended option first, labelled "(Recommended)";
- one line of description per option;
- the user can always type their own answer.

Base the options on what you found in the repository. Keep the creative interview to the three
rounds below, after the presenter-format question.

**Round 1: the project.** Ask this after a quick read of the repo (README, package.json, routes, deploy
config):

1. **What are we showcasing?** Offer the kind you detected as Recommended, then the next most likely
   ones:
   - Next.js/Astro marketing pages → website;
   - a dashboard or auth routes → web app;
   - Expo or React Native → app;
   - n8n/Make/Zapier exports or workflow scripts → automation;
   - `brand.json`, brand guidelines HTML, logo files → branding.
2. **What is the post for?** Portfolio piece (Recommended) · Client delivery · Promotion/ad.
3. **Where do we record it?** The deployed URL you found (check it returns 200) · An existing local build
   (`--serve dist`) · A dev server (only with the user's permission, since it may write files) · Their own
   screen recordings (`import`).
4. **Which devices?** The kind's default (Recommended) · Desktop only · Mobile only.

**Round 2: the story.** Ask this after inspecting the real pages, screens or workflow. In voice-over
mode, a first capture can help. In presenter mode, move this round before capture and skip question 3
because the recording supplies the voice.

1. **What should the video highlight?** (multiSelect) Up to 4 real features, pages or steps you
   found, named the way the product names them.
2. **Tone of the voice-over?** Confident and warm (Recommended) · Calm and premium · Upbeat.
3. **Voice?** British female, Kokoro `bf_emma` (Recommended: the approved voice) · British male,
   Kokoro `bm_george` · A cloud voice. Only offer a cloud voice if `SC voices` shows it is
   configured.
4. **Closing line?** "Want a <website|web app|app|automation|brand> like this for your business? Send
   us a message." (Recommended) · Their own line. Keep it to about 3.5 s: the 3.6 s outro holds the
   signature for a second after it.

**Round 3: approval, before rendering.** Show the user:
- a storyboard table: part, seconds, what is on screen, the narration line;
- the cover preview (`SC cover <slug>`) and the profile grid (`SC grid <slug>`), sent as images.

Then ask **Render it?** with the options Render (Recommended) · Change the script · Change the
walkthrough. Loop on changes until they say render.

Save the answers in the project config under `brief`, so the video can be remade the same way.

## Workflow

Follow [WORKFLOW.md](WORKFLOW.md). In short:

1. **Inspect (read-only).** Framework, scripts, build output, deployed URL, languages (prefer `/en`),
   pages, navigation (plain links vs dropdowns, the mobile menu), strongest visual sections, privacy
   risks.
2. **Interview, round 1.**
3. **Create the project:**

   ```bash
   SC init <slug> --kind <kind> --url <url> --name "<Client>" --category "<Category>"
   ```

   This writes the config with the approved template, the kind's timing and the cover turned on.
   Then edit `capture.journeys`, `narration.lines`, `project.displayUrl` and `video.output`.
   Examples are in [CONFIG-EXAMPLE.md](CONFIG-EXAMPLE.md).
4. **Web apps and automations need a demo account.** The user runs `SC login <slug> --url <app>` and
   signs in in the Chrome window themselves. You never type passwords. The session is saved to the
   project (`capture.auth`).
5. **Capture:** `SC capture <slug>`. Read `capture/report.md` and a few `steps/*/after.jpg`. Hide
   banners and overlays (`capture.hide`) and blur anything personal (`capture.blur`).
6. **Interview, round 2.** Then write 7–8 short lines tied to their steps and run `SC narrate <slug>`.
   In voice-over mode, aim for about 25 s. In presenter mode, use the script and source takes reviewed
   before capture, and follow the timing of the recording.
7. **Review:** `SC still <slug>`, `SC cover <slug>` and `SC grid <slug>`. Then **interview round 3**.
8. **Render:**
   - `SC render <slug>` writes the MP4, `instagram-cover.png`, the grid-crop preview and the QA
     report, and records the post as a draft in the portfolio;
   - it takes a few minutes, so run it in the background.
9. **Validate:** read `out/qa/report.md` and fix every FAIL. Look at the contact sheet and the cover
   preview.
10. **Deliver** (below). When the user says it is posted, run
    `SC portfolio publish <slug> [--url <post url>]`.

## The profile stays one portfolio

- Keep the studio's structure, identity, cover layout, music and outro consistent. Use the selected
  narration source for each Reel.
- Eyebrow taxonomy on the cover: `<Kind> · <Category>` (`Website · Restaurant`,
  `Automation · Lead follow-up`, `Branding · Coffee roaster`).
- Before rendering, run `SC grid <slug>`. It previews the profile with this post first and warns about:
  - three posts of the same kind in a row;
  - a cover colour too close to a neighbour;
  - a title too long for a thumbnail.

  It also names the kinds missing from the last nine posts. Share the warnings with the user and let
  them decide.
- The cover is a frame of the video, the settled cover lockup, exported losslessly. The title is the
  client's name or a 2–3 word project title. No extra text, stock images or effects.

## Narration

- Natural, confident, conversational English for an Irish business audience. Short sentences.
- Describe only what is on screen, in the part where it appears. No invented features, claims,
  prices, numbers, awards or reviews.
- For automations, say what triggers it, what it does and what the result is, in plain words.
- Preserve the delivery pace. Shorten scripted lines before recording or adjust the edit to fit
  an existing take. For a generated voice provider that needs a key, name the environment variable.

## Rules

- **Only real work.** Show only real pages, screens, data flows and interactions. Use demo accounts
  and demo data for anything behind a login.
- **No private data on screen.** Never capture or show credentials, customer or personal data, API
  keys, admin panels, staging banners or dev overlays. Blur or hide what cannot be avoided.
- **Never handle passwords.** The user signs in themselves (`SC login`). Never write keys into files.
- **Keep the identity.** No zooms, camera rotations, flashy transitions, sped-up scrolling or site
  animations, long static screenshots or generated walkthrough footage. Presenter mode may use
  the avatar clip supplied by the user.
- **Never edit the template for a project.** Don't change the engine's `src/` or a published
  template's numbers. Everything project-specific goes in the project config.
- **Music:** the engine's own bed, or a track the user supplies with its licence recorded. Never
  download music.
- **Never publish anything.** Don't post, upload or publish the video, cover or projects anywhere.
  `portfolio publish` is local bookkeeping only.
- **Check this repo.** At the end, run `git status` here: it must be unchanged.

## Deliver

Report:
- the MP4 path, duration and kind;
- `instagram-cover.png` and the grid preview;
- the walkthrough (what was shown);
- the narration and voice;
- the music source;
- the QA result;
- the grid check;
- what the user should still check: client approval to publish, the agency details in
  `agency.config.json`, licences.

Leave the files in `<engine>/projects/<slug>/out/` unless asked otherwise.

## Supporting files

- [WORKFLOW.md](WORKFLOW.md): the full process per kind, with checks.
- [PRESENTER.md](PRESENTER.md): recording prompt, footage review and presenter configuration.
- [STYLE-GUIDE.md](STYLE-GUIDE.md): the visual, pacing, narration, audio, cover and profile rules.
- [CONFIG-EXAMPLE.md](CONFIG-EXAMPLE.md),
  [showcase.config.example.json](showcase.config.example.json) and
  [automation.config.example.json](automation.config.example.json): annotated configs.
- [reference.md](reference.md): every configuration option.
- [templates.md](templates.md): the templates.
- [FRAMEWORK.md](FRAMEWORK.md): architecture and pipeline.
- [INSTALLATION.md](INSTALLATION.md): install, update, troubleshooting, licensing.
- `scripts/showcase.mjs`: the launcher.
