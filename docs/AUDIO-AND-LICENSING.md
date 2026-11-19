# Audio and licensing

The soundtrack has three layers: narration (see [NARRATION.md](NARRATION.md)), music, and subtle SFX.

## Music

**Engine bed (default).** `public/engine/music/engine-bed-100.wav` is an original composition rendered
by `engine/audio/synth-music.ts` from oscillators, filters and an algorithmic reverb: warm detuned pads,
a soft pluck arpeggio with ping-pong delay, sub bass and restrained drums with sidechain-style ducking,
100 BPM. It contains no samples or third-party material, so it is cleared for organic posts, client work
and paid ads. Regenerate with `npm run showcase -- music`. Turn it off with `audio.builtinMusic: false`.

**Your own track.** Supply a file you are licensed to use in `audio.music.file` and record the licence in
`audio.music.licence` (title, artist, source, licence, proof, whether cleared for ads). The CLI warns when
it is missing; `clearedForAds` defaults to `false` because many "royalty-free" licences exclude ads. The
engine never downloads music.

With any music:

- Boundaries between intro, desktop, mobile and outro land on beats (known BPM, or `bpm: "auto"`).
- The music fades in over 0.6 s and out over the last 1.2 s.
- **Ducking**: while the narrator speaks, music eases down to `audio.duckTo` (default 0.12) in 0.25 s and
  recovers to `audio.musicVolume` (default 0.32) over 0.45 s after each line. No sudden level changes.
- `render` also produces `-no-music.mp4` (narration + SFX), handy for adding Instagram's own audio.

## Sound effects

`public/engine/sfx/` holds sounds **synthesised from scratch** by `engine/audio/synth-sfx.ts`
(no third-party samples): soft whooshes for the title and hand-overs, a mouse click on desktop clicks,
a muted tick on mobile taps, a soft chime and low thump as the agency signature resolves. Cues are
declared in `src/timeline.ts` (`buildSfxCues`) against the same frames the animation uses and kept quiet
(`audio.sfxVolume`, default 0.7).

## Voice licensing

| Provider | Licence notes |
|---|---|
| Kokoro (local) | Model weights Apache-2.0 (hexgrad/Kokoro-82M, ONNX export by onnx-community). Output usable commercially |
| ElevenLabs | Commercial use requires a paid plan; check the voice's own terms for Voice Library voices |
| Azure Speech | Standard neural voices are licensed for commercial use under the Azure terms |
| OpenAI TTS | Output may be used commercially under OpenAI's terms; disclose AI voices where required |

Where a platform asks, label the narration as AI-generated.

## QA

`render` measures the mix: integrated loudness and true peak, every narration line audible, and speech at
least 6 dB above the music-only gaps (ducking working).
