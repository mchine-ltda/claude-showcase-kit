# Style guide

One look for every post, so an Instagram profile of showcases reads as one curated portfolio: an
industrial company's website, a salon's booking app, a restaurant's automation and a café's new brand
all look like the same studio's work. The frame, motion, typography, sound and cover are identical;
only the work changes. Everything here is implemented by the engine. Projects never redesign it.

## Principles

1. **The work is the hero.** A dark stage, one device at a time, the real work in full colour.
2. **The work moves, the camera doesn't.** The browser and phone stay at one stable scale for their
   whole part, with a 2–3 px float at most. No zooms, punch-ins, crops or camera rotations.
3. **Real interactions only.** Real scrolling, menus, taps, typing, page changes and runs, recorded
   with Playwright and played back at the work's real speed.
4. **Always progressing, never rushed.** Steps wait only as long as the work's own animation needs.
   No still moment is longer than ~1.8 s.
5. **The narration drives the edit.** Each action starts with the sentence that describes it.

## Identity (the agency's)

Set once in `agency.config.json`, the same for every post:

| | | Example (MCHINE) |
|---|---|---|
| `logo` | A light, transparent wordmark. Shown on the cover and in the outro | `mchine` wordmark with its lime dot |
| `accent` | The agency colour: outro glow, CTA rule, the CTA's italic word | `#c8ff32` |
| `identity.display` | Titles and the outro CTA | General Sans 600, tracking −0.04 em |
| `identity.body` | Subtitles, small text | Geist 500 |
| `identity.mono` + `eyebrow: "mono"` | The eyebrow label in monospaced caps | Geist Mono 500 |
| `subtitle`, `cta` | The outro lines | "Precision-built for the web.", "Let's build *yours.*" |

The italic emphasis word is always Instrument Serif. Without an `identity`, the engine uses its
original type (Inter Tight, wide-tracked caps).

## The stage

| Token | Value | Use |
|---|---|---|
| void / charcoal / graphite | `#070708` / `#0d0d0f` / `#17171a` | Stage and depth |
| text / soft / muted | `#f3f2ee` / 72% / 46% | Titles, subtitles, labels |
| project accent | The work's own brand colour (`project.accent: "auto"`), lifted for contrast | Stage glow, eyebrow dot |

The stage glow hands over from the project's accent to the agency's accent as the outro arrives.

## Devices

- **Browser:**
  - dark, minimal chrome with the real domain and path in the address pill (each site's own host in
    an automation);
  - a fine load line on navigation;
  - captured at 1280×1320 CSS px (2× pixels), so in 9:16 it fills the band at one scale (0.768×);
  - the cursor follows curved paths, presses, and shows the work's own hover states.
- **Phone:**
  - a graphite flagship-style frame, captured at 390×844 CSS px (3× pixels);
  - the status bar takes the page's top colour;
  - taps show a soft ring.

## Composition (1080×1920)

- Reels safe area: top 250, bottom 420, left 90, right 130 px. Text never leaves it.
- The device band runs from just under the top safe line to above the subtitle band.
- Subtitles sit under the device: one short phrase at a time (≤ 8 words / 40 characters) in the body
  face.

## Edit and pacing (template `v3-dynamic`)

These timings are for the standard voice-over. In presenter mode the opening and closing cards
follow the recorded speech while the cover and device walkthrough keep the studio layout.

| Part | Website, web app | App | Automation, branding |
|---|---|---|---|
| Cover lockup | ~1.2 s | ~1.2 s | ~1.2 s |
| Walkthrough | desktop ~11.4 s + mobile ~11.4 s | mobile ~20 s | desktop ~20 s |
| Outro | ~3.6 s | ~3.6 s | ~3.6 s |

**Transitions**
- a depth dissolve into the walkthrough and into the outro (10 frames);
- a short directional push from desktop to mobile (14 frames);
- in-page cuts and cuts between sites dissolve over 6 frames and keep drifting into place.

**Rhythm**
- Part boundaries land on the music's beat, and cuts and clicks snap to it when within 4 frames.
- Every click or tap lets the work's own animation finish.
- Typing plays at a natural ~16 characters a second.

**Never**
- zooms;
- rotations;
- flashy or random transitions;
- motion blur on content;
- sped-up scrolling or animations;
- long static screenshots;
- generated walkthrough footage or stock inserts in the device walkthrough.

## Narration

- **Voice-over only:** Kokoro `bf_emma` at speed 1.0, warm and neutral British English that suits an Irish
  audience. Cloud voices (ElevenLabs, Azure `en-IE-*`, OpenAI) are optional, with their own key.
- **Script:** 7–8 short lines, about 20 s of speech, 0.25 s apart. Confident and conversational,
  never salesy.
- **Content:** only what is on screen, while it is on screen. No invented claims, numbers, awards or
  testimonials.
- **Shape:**
  - "Meet <Client>.";
  - an opener;
  - one line per highlight;
  - a short closer;
  - "Want a <website|web app|app|automation|brand> like this for your business? Send us a message."
    It starts as the device leaves; the outro holds the CTA and signature for about a second after it.

With a presenter, use the recording for all narration. Show the presenter in rounded cards after
the cover and before the studio signature. Select the crop and background treatment using
[PRESENTER.md](PRESENTER.md).

## Audio mix

| Element | Setting |
|---|---|
| Voice | Each take trimmed and levelled to −18 dBFS RMS, soft-limited under −3 dBFS |
| Music | The engine's original 100 BPM bed at 0.32, ducked to 0.12 under speech |
| SFX | Engine-made soft clicks and taps, whooshes on part changes, a whisper on cuts, a chime under the signature |
| Result | Voice ~14 dB above music + SFX, about −16.5 LUFS, true peak ≤ −1 dBTP |

## Instagram cover

The cover is a frame of the video: the opening **cover lockup**, composed to be paused.

**Layout (1080×1920)**

| Element | Position |
|---|---|
| Eyebrow `<Kind> · <Category>` | ~25% height |
| Title (client name or a 2–3 word project title) | ~30% |
| Devices | Centre, ~55%: the work's real hero in the browser, the phone in front to the right; one device alone when the kind has one |
| Glow | A soft project-accent glow behind the devices |
| Agency signature | ~77% |

Everything important stays inside the profile grid's **3:4 crop** (y 240–1680), the older **1:1
crop** (y 420–1500) and the Reels safe area. The lockup settles by frame 22 (~0.7 s), which is the
default cover frame, then keeps drifting gently. The intro is never lengthened for the cover.

**Avoid**
- extra text;
- logos alone;
- stock photos;
- busy backgrounds;
- an unreadable hero. Fix the capture, not the layout.

## The profile: one portfolio with a logic

- **Taxonomy.** Every cover carries `<Kind> · <Category>`, and the five kinds keep their names:
  Website, Web app, App, Automation, Branding.
- **Rhythm.** Avoid three posts of the same kind in a row. Prefer alternating desktop-led kinds
  (website, automation, branding) with phone-led ones (app).
- **Colour.** Neighbouring covers should not share nearly the same accent (the grid check flags a
  distance under ~90).
- **Titles.** Use the client's name or a 2–3 word project title. Keep the same capitalisation style
  on every post.
- **Check before posting.** `showcase grid <slug>` shows the profile with the new post first and
  lists anything that breaks these rules. The user decides.

## Format

- 9:16, 1080×1920, 30 fps, H.264 High (yuv420p, BT.709), AAC 320 kbps 48 kHz, faststart.
- `portrait`, `square` and `landscape` exist for other placements; the Reel is the standard.
