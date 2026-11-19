# Motion identity

One consistent, agency-wide look. Tokens live in `src/theme/tokens.ts`; change them there to evolve
every future video at once.

## Principles

1. **The website is the hero.** Dark charcoal stage, one device at a time, a short title and a CTA.
2. **The site moves, the camera doesn't.** The browser and phone sit at one stable, well-composed scale
   for their whole part (a 2–3 px float at most). Movement comes from real scrolling, real menus, real
   hovers and real page changes. No zooms, punch-ins or crops.
3. **Fill the frame without zooming.** Desktop is captured in a tall 1280×1320 window, so in a 9:16 Reel
   the browser fills the band between Instagram's header and the subtitles at a single scale.
4. **Feel like a person is using it.** Curved cursor paths with natural easing, a press, the site's own
   hover state, a page-load line in the address bar, the new URL. On mobile, a soft touch ring and the
   real menu animation (recorded with the site's motion slowed, then played back at real speed).
5. **Acceleration, not speed.** Expo-out entrances, trackpad-like scroll curves. Scroll targets stay
   within about two screens so content stays readable.
6. **Narration drives the edit.** Parts stretch to fit their lines; desktop and mobile stay balanced;
   with music, boundaries land on beats.
7. **Readable on a phone.** Statement text and subtitles are measured with the real fonts and kept inside
   the Reels safe area (top 250, bottom 420, left 90, right 130 px at 1080×1920).

## The four parts

| Part | Default | What happens |
|---|---|---|
| 1 Intro | ~1.5 s | Eyebrow (`Website · <category>`) and the project name rise in; narration starts at once |
| 2 Desktop | ~12.5 s | Browser rises in; homepage scroll → header dropdown/link → page loads → scroll → next page → scroll |
| 3 Mobile | ~12.5 s | Directional hand-over to the phone; homepage scroll → menu → tap a page → scroll → contact |
| 4 Outro | ~1.5–2.5 s | CTA, accent hairline, agency signature, subtitle; fade to black for a clean loop |

Transitions: depth dissolve into desktop and outro, a short directional push from desktop to mobile.
One persistent backdrop whose tint hands over from the website's accent to the agency's accent.

These are the V2 (`v2-stable`) lengths. The V3 (`v3-dynamic`) template keeps every principle above and
re-times the same parts to ~1.2 s / ~11.4 s / ~11.4 s / ~1.8 s, with in-page cuts that dissolve over 6
frames and keep drifting, steps that wait only as long as the site's own animation needs, and cuts and
clicks landing on the beat. See [TEMPLATES.md](TEMPLATES.md).

## Typography

- Inter Tight 600, tight tracking, for statements; Instrument Serif italic for the single emphasised word.
- Subtitles: Inter Tight 500, 44 px, short phrases, under the device.

## Credits

Camera technique and pacing rules were informed by
[video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft) (Apache-2.0): the CSS-zoom
rasterisation trick from its `PageCam`, its rules on holds, stable cameras and declarative SFX tables.
The code here is an original implementation; see `THIRD_PARTY_NOTICES.md`.
