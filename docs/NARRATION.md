# Narration

Every showcase can carry a natural English voice-over. The script is per project
(`narration.lines` in `showcase.config.json`); the voice is per project too; the engine voices each
line, caches it, levels it, places it in the right part of the film and ducks the music under it.

## Providers

| Provider | Setup | Voices for an Irish / British audience | Notes |
|---|---|---|---|
| `kokoro` (default) | none; the model (~330 MB) downloads once to `.cache/models` | `bf_emma` (best British voice), `bf_isabella`, `bm_george`, `bm_fable`, `bm_lewis` | Local neural TTS (Kokoro-82M, Apache-2.0 weights). No account, no per-use cost, commercial use permitted. Neutral British English; no Irish accent available |
| `elevenlabs` | `ELEVENLABS_API_KEY` | pick an Irish or British voice in the ElevenLabs Voice Library and use its voice id | Most natural delivery. Commercial use requires a paid plan |
| `azure` | `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` | `en-IE-EmilyNeural`, `en-IE-ConnorNeural` (Irish), `en-GB-SoniaNeural`, `en-GB-RyanNeural` | Real Irish neural voices |
| `openai` | `OPENAI_API_KEY` | `sage`, `ballad`, `coral` with `instructions` steering accent and tone | `gpt-4o-mini-tts`; accent is guided, not guaranteed |

Check what is configured: `npm run showcase -- voices`.

Set keys as environment variables (never in config files), for example in PowerShell:

```powershell
[Environment]::SetEnvironmentVariable('ELEVENLABS_API_KEY', '<your key>', 'User')
```

then switch the project:

```json
"voice": { "provider": "elevenlabs", "voice": "<voice id>", "speed": 1 }
```

## Writing a script

- 5–7 short lines: one intro, two desktop, two or three mobile, one outro question.
- Say only what the film shows: pages that were really visited, interactions that really happen.
  The capture report (`capture/report.md`) lists every page and step.
- Mention desktop while desktop is on screen and mobile while mobile is on screen (`segment`).
- Use `step` to start a line with a specific step, e.g. the menu opening.
- Warm and plain beats advertising: "Visitors can open the services menu and compare each trade."
- Commas create natural pauses; numbers are spoken as written.

The automatic script (`"lines": "auto"`) follows these rules from the captured journeys.

## Timing

Parts stretch to fit their lines (lead-in, speech, gaps, a short tail). Desktop and mobile stay
balanced. The closing question starts as the phone leaves so the outro stays short.
`npm run showcase -- narrate <slug>` prints every line's start time and the length of each part.

## Mix

- Every take is trimmed and levelled to the same speech loudness (about -18 dBFS RMS, peaks under -3 dBFS so the final mix keeps headroom).
- Music dips to `audio.duckTo` while the narrator speaks and recovers between lines.
- QA measures the rendered mix: every line must be audible and speech must sit at least 6 dB above the
  music-only gaps.
