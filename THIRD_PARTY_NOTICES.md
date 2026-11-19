# Third-party notices

## Remotion

Rendering uses [Remotion](https://www.remotion.dev) (`remotion`, `@remotion/*`). Remotion has its own
licence: free for individuals and small teams, a company licence may be required depending on team size.
Check https://www.remotion.dev/license before commercial use.

The official Remotion agent skills ([remotion-dev/skills](https://github.com/remotion-dev/skills))
are recommended for working on the template; they are not included here.

## video-shotcraft (Apache-2.0)

Techniques adapted, not copied, from https://github.com/Vincentwei1021/video-shotcraft,
Copyright Vincent Wei, licensed under the Apache License 2.0:

- Magnifying 3D page layers with CSS `zoom` and the `T = screen / zoom - origin` placement maths
  (`assets/lib/PageCam.tsx`), reimplemented in `src/components/Stage3D.tsx`.
- Pacing and quality rules from `references/aesthetic-rules.md` (holds, stable camera, single subject,
  declarative SFX cue table, AAC priming offset).

No source files, media or audio from video-shotcraft are included.

## Playwright

Website capture uses [Playwright](https://playwright.dev) (Apache-2.0).

## Fonts

Inter Tight, Instrument Serif, Geist and Geist Mono are loaded through `@remotion/google-fonts` (SIL
Open Font License 1.1). Fonts you add for your own agency identity (`agency/fonts/`) keep their own
licences and are not part of this repository.

## Sound effects

All sounds in `public/engine/sfx/` are synthesised by this project (`engine/audio/synth-sfx.ts`) and
contain no third-party material.

## Demo fixture

`fixtures/demo-site/` is an original, fictional website made for testing. Its illustrations are CSS/SVG.
It loads Fraunces and Inter from Google Fonts (SIL OFL 1.1).

## Narration (text-to-speech)

- [kokoro-js](https://github.com/hexgrad/kokoro) (Apache-2.0) runs the Kokoro-82M model
  ([hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), Apache-2.0; ONNX export
  `onnx-community/Kokoro-82M-v1.0-ONNX`) through [Transformers.js](https://github.com/huggingface/transformers.js)
  (Apache-2.0) and ONNX Runtime (MIT). The model is downloaded on first use to `.cache/models`.
- Cloud providers (ElevenLabs, Azure Speech, OpenAI) are called only when their API keys are set; their
  own terms apply to generated audio.

## Music

`public/engine/music/` is an original composition rendered by `engine/audio/synth-music.ts`; it contains
no third-party material.
