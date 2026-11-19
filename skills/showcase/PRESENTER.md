# On-camera presenter

## Before recording the walkthrough

Inspect the work and any visual reference the user supplied. Pick real features and sketch the order
in which they will appear. Complete the relevant project and story questions from [SKILL.md](SKILL.md)
before preparing the recording prompt. The project's audience, visual identity and reference should
guide the backdrop and lighting. Choose a solid, quiet background with enough separation from the
presenter's hair and clothes. A warm off-white can work for a light editorial site, and a charcoal
studio wall can suit a dark reference. Respect any user preference for location or background.

Write a short script with an opening hook, the lines that describe the walkthrough and a closing
call to action. Keep one standalone beat per line and map each walkthrough line to its planned
capture step. Use the user's language for the directions and the agreed narration language for the
script. Default to conversational English for an Irish business audience. Budget the words for
their natural delivery, including the presenter cards and studio signature.

Give the user one **copy-ready prompt** for their avatar generator or human recording. Keep the
shot directions outside the spoken script. Use the following structure and fill in the concrete
choices for this project.

> Create one continuous vertical 9:16 talking-head take. Read the script at the end word for word,
> in the given order. Frame a centred head-and-shoulders shot at eye level with a little headroom.
> Look into the lens. Keep the camera fixed and use soft, even front lighting.
>
> Use the chosen solid background with the colour and lighting specified for this project. Keep
> the picture clean, with only the presenter in the frame, and record isolated spoken audio.
> Speak naturally and conversationally at the agreed pace. Leave roughly one second of silence
> before the first line, between every line and after the last line. End with a relaxed smile
> if it suits the delivery.
>
> Supply the original vertical MP4 with its audio, ideally 1080 × 1920 at 30 fps.
>
> **Spoken script**
>
> Put the project's exact lines here, separated by blank lines.

Ask for the original take with isolated voice and a clean frame suitable for editing. Captions,
graphics, music and the device walkthrough are added in the edit. Send the prompt and end the
turn. Wait for the recording before project setup, walkthrough capture, cover previews or rendering.

## When the footage arrives

1. Inspect each supplied clip and listen through the takes. Check spoken wording and order against
   the script. Identify any restarts, missing lines, background noise, existing overlays and framing
   constraints. A usable supplied recording can go straight to this review.
2. Choose the card crop per video from actual frames at the beginning and end. Preserve the speaker's
   eyes, headroom and shoulders. An even wall can stay visible inside the rounded card. Use
   `presenter.inset` to trim excess space or objects near an edge when the framing allows. Ask for a
   replacement or the affected line again if the needed speech or a usable picture is missing.
3. Set `narration.lines` to the verified spoken words in order. Use `intro` and `outro` for
   the large cards. Use `desktop` or `mobile` with the relevant `step` IDs for the walkthrough.
   The presenter is visible in the opening and closing cards. Their recorded voice and captions
   in the script language accompany the walkthrough.
4. Set `presenter.video` to the local file, relative to the project config or an absolute path.
   Given a clean continuous recording, the engine can find takes separated by `presenter.minPause`.
   Listen to the result to verify the cut points. If pauses are uneven or there are retakes, use
   `presenter.takes` with one `[startSeconds, endSeconds]` pair per line in chronological order.
   Pick the complete read of each line and leave a small audio margin around it. If the user supplies
   separate clips, assemble the selected takes in script order into a single local source first.
5. Run the normal capture, `SC narrate <slug>` and review steps. Check that the cover appears first,
   the two cards show the correct takes, the CTA follows the final line, and narration, captions and
   website actions match. Use the original recorded pace to budget the timeline, then show the
   normal storyboard and cover for approval. If desktop and mobile need different lengths, set
   `video.balance` to `false` and set each `video.timing` minimum to match the actions on that
   device. The engine allows a minimum of four seconds per device and extends it to fit speech.

Example project config excerpt for a clip with manually selected takes:

```json
{
  "presenter": {
    "video": "media/presenter.mp4",
    "takes": [[1.1, 3.8], [4.7, 8.4], [9.5, 12.3], [13.2, 15.9]],
    "inset": { "top": 0.06, "bottom": 0.12 }
  },
  "narration": {
    "lines": [
      { "segment": "intro", "text": "Here’s how this shop welcomes new customers." },
      { "segment": "desktop", "step": "browse", "text": "Browse the collection and see the available colours." },
      { "segment": "mobile", "step": "open-product", "text": "On a phone, you can open the product in one tap." },
      { "segment": "outro", "text": "Want a site like this? Send us a message." }
    ]
  },
  "video": { "balance": false, "timing": { "desktop": 6, "mobile": 4 } }
}
```

Keep the raw footage, take timings and generated files in the local project. If a paid recording
service is needed, the user can run the prompt in their tool and send the result.
