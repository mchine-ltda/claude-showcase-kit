#!/usr/bin/env bash
# Claude Showcase Kit installer (macOS, Linux, Git Bash on Windows)
#
#   ./install.sh              install the /showcase skill for every project (~/.claude/skills)
#   ./install.sh --project /path/to/project   install it into one project's .claude/skills
#
# Installs the engine's dependencies in this folder, creates agency.config.json from the
# example (once), and installs the skill, which remembers where this folder is.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$here"

bold=$'\033[1m'; dim=$'\033[2m'; lime=$'\033[38;5;154m'; red=$'\033[31m'; off=$'\033[0m'
say() { printf "%s\n" "$*"; }

say ""
say "${lime}●${off} ${bold}Claude Showcase Kit${off} ${dim}→ $here${off}"
say ""

# Node 20.19+ / 22.13+ / 24+
if ! command -v node >/dev/null 2>&1; then
  say "${red}Node.js is required (20.19 or newer): https://nodejs.org${off}"; exit 1
fi
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>=24||(a===22&&b>=13)||(a===20&&b>=19)||a===23?0:1)'; then
  say "${red}Node.js 20.19+, 22.13+ or 24+ is required (found $(node -v)).${off}"; exit 1
fi

say "${dim}Installing dependencies (Remotion, Playwright, the local voice)…${off}"
npm install --no-audit --no-fund --loglevel=error

if [[ ! -f agency.config.json ]]; then
  cp agency.example.json agency.config.json
  say "  created ${bold}agency.config.json${off}: put your studio's name, logo and colours in it"
fi

dir_args=()
if [[ "${1:-}" == "--project" ]]; then
  dir_args=(--dir "${2:-$PWD}/.claude/skills")
fi
npx tsx engine/cli.ts skill:install "${dir_args[@]}"

say ""
npx tsx engine/cli.ts doctor || true
say ""
say "${lime}●${off} Done. Start a new Claude Code session in any repository and type ${bold}/showcase${off}."
say "  ${dim}Try the demo first: npm run demo${off}"
say ""
