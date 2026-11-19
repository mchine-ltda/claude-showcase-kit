# Templates

Every template uses the same components and the same look: the dark stage, the browser and phone
mockups, the typography, the transitions, subtitles and the mix. A template changes only **pacing and
editing rhythm**: how long each part lasts, how fast steps follow each other, how transitions and
narration line up. Each one is a frozen table of numbers in [`src/templates.ts`](../src/templates.ts).

| | `v2-stable` (kept for reproduction) | `v3-dynamic` (**approved, default**) |
|---|---|---|
| Name | Cinematic Premium V2 (Stable) | Cinematic Premium V3 (Dynamic Reels) |
| Typical length | 28–30 s | 24–26 s |
| Default parts (min.) | intro 1.5 · desktop 12.5 · mobile 12.5 · outro 1.5 s | intro 1.0 · desktop 11 · mobile 11 · outro 1.5 s |
| Pause between lines | 0.35 s | 0.25 s |
| Transitions in (frames) | desktop 12 · mobile 18 · outro 12 | desktop 10 · mobile 14 · outro 10 |
| Intro narration | must finish inside the title | may carry 0.45 s over the browser's arrival (L-cut) |
| Closing question | starts 0.35 s before the outro | starts 0.75 s before the outro, as the phone leaves |
| Step planner | proportional split, 0.75 s minimum | every action gets exactly what its real animation needs, spare time shared by weight, 0.6 s minimum |
| Beat sync | part boundaries | part boundaries, plus untied cuts, clicks and scroll starts moved onto a beat (≤ 4 frames) |
| In-page cut (`"do": "cut"`) | instant | 6-frame dissolve, then a short drift into place |
| Cursor | 10–20 frame travel, click 5 frames after arrival | 9–15 frame travel, click 4 frames after arrival |
| Auto journeys | home → services overview → projects; mobile home → menu → service → contact | adds a cut to a further home section, opens a specific service page, short projects stop |
| QA freeze limit | 2.5 s | 1.8 s |

What never changes between templates: the browser stays at one fixed scale (no zoom), scrolling is the
website's own recorded scroll, every page and menu is real, and the site's own animations play at their
real speed. V3 is a re-edit, not a sped-up V2: nothing is time-stretched, the voice is not accelerated.

## Choosing a template

In the project config:

```json
{ "template": "v3-dynamic" }
```

or for a one-off render: `npm run showcase -- render <slug> --template v3-dynamic` (the file gets a
`-v3-dynamic` suffix). `npm run showcase -- templates` lists them. `init --template v3-dynamic` writes
a config with that template's default timing.

The template also picks the **auto journeys** used at capture time when `capture.journeys` is `"auto"`,
so capture again after switching templates on an auto project.

Explicit values in the config always win over the template's defaults: a config that sets
`video.timing` or `narration.gapSeconds` keeps them under any template. Leave them out to get the
template's defaults.

## Comparing templates on one website

Create a second project for the same site (captures and narration are stored per project, so the two
versions never overwrite each other):

1. Copy `projects/<slug>/showcase.config.json` to `projects/<slug>-v3/showcase.config.json`.
2. Set `"template": "v3-dynamic"`, adjust `video.timing` (or remove it), `narration.gapSeconds`,
   `video.output`, and if you like the journeys and a tighter script.
3. `capture <slug>-v3`, `narrate <slug>-v3`, `render <slug>-v3`.


## Rules for templates

- **Never change the values of a published template.** A template is a promise that an old project
  re-renders identically. Check it with `showcase -- compare <new.mp4> <old.mp4>`: the same frames,
  bit-identical audio and a picture equal within Chrome's run-to-run raster noise (MP4 bytes always
  differ between renders, even of the same code).
- A new idea becomes a new template id (`v4-...`) with its own spec, added to `TEMPLATE_IDS`.
- `DEFAULT_TEMPLATE` is `v3-dynamic`; a newer template becomes the default only after explicit
  approval. Props written before templates existed render as `v2-stable` (`LEGACY_TEMPLATE`).
- The Instagram cover lockup (`video.cover.enabled`) and the agency `identity` are options on top of
  any template: on for every project created with `init`, off (and unchanged) for older projects.
- Shared component changes must keep every existing template's output unchanged. After touching
  `src/`, re-render an existing project and run `compare` against its earlier render before shipping.
