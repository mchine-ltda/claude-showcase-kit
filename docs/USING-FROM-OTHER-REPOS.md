# Using the kit from your other repositories

The kit lives in one folder. Your repositories never get a copy of it and are never modified. Each
video is a small project folder inside the kit (`projects/<slug>/`) holding its config, captures,
narration takes and renders.

## With Claude Code (recommended)

After `./install.sh` (or `.\install.ps1`), the `/showcase` skill is available in every repository.
Open Claude Code in the repository of the work and type:

> /showcase

or *"make an Instagram reel of this web app"*. Claude follows the skill:

1. it inspects the repository read-only;
2. it interviews you in three multiple-choice rounds;
3. it records the real work;
4. it writes and voices the script;
5. it shows you the storyboard, the cover and the profile grid, and renders on your yes;
6. it reads the QA report and gives you the files.

## The launcher

The skill ships a launcher that finds the kit from any directory (through `engine.json` next to the
skill, or `SHOWCASE_ENGINE_DIR`) and runs its CLI. Relative paths resolve against where you run it:

```bash
node "$HOME/.claude/skills/showcase/scripts/showcase.mjs" where
node "$HOME/.claude/skills/showcase/scripts/showcase.mjs" init murphys --kind website --serve dist --name "Murphy's Bakery"
node "$HOME/.claude/skills/showcase/scripts/showcase.mjs" capture murphys
node "$HOME/.claude/skills/showcase/scripts/showcase.mjs" narrate murphys
node "$HOME/.claude/skills/showcase/scripts/showcase.mjs" render murphys
node "$HOME/.claude/skills/showcase/scripts/showcase.mjs" grid murphys
```

Inside the kit folder, the same commands are `npm run showcase -- <command>`.

## Where things end up

```
claude-showcase-kit/projects/
  portfolio.json            ← every rendered and published post (draft/published)
  portfolio-grid.png        ← the last grid preview
  murphys/
    showcase.config.json    ← kind, journeys, narration, timing, cover, brief
    auth/                   ← a saved demo-account session (only if you ran login)
    capture/                ← pages (tiles), step frames, manifest.json, report.md
    narration/              ← voiced takes (cached per line)
    out/
      murphys-showcase.mp4
      instagram-cover.png, instagram-cover-preview.png
      stills/, qa/report.md, qa/contact-sheet.png
```

All of `projects/` is private and git-ignored. Re-render any time without recapturing. Edit a
narration line and only that line is re-voiced. Recapture when the work changes.
