# Claude Showcase Kit installer (Windows PowerShell)
#
#   .\install.ps1                          install the /showcase skill for every project (~/.claude/skills)
#   .\install.ps1 -Project C:\path\to\repo install it into one project's .claude\skills
#
# Installs the engine's dependencies in this folder, creates agency.config.json from the
# example (once), and installs the skill, which remembers where this folder is.
param([string]$Project = "")
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host ""
Write-Host "* Claude Showcase Kit -> $PSScriptRoot" -ForegroundColor Green
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js is required (20.19 or newer): https://nodejs.org" -ForegroundColor Red; exit 1
}
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>=24||(a===22&&b>=13)||(a===20&&b>=19)||a===23?0:1)'
if ($LASTEXITCODE -ne 0) {
  Write-Host "Node.js 20.19+, 22.13+ or 24+ is required (found $(node -v))." -ForegroundColor Red; exit 1
}

Write-Host "Installing dependencies (Remotion, Playwright, the local voice)..." -ForegroundColor DarkGray
npm install --no-audit --no-fund --loglevel=error
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not (Test-Path "agency.config.json")) {
  Copy-Item "agency.example.json" "agency.config.json"
  Write-Host "  created agency.config.json: put your studio's name, logo and colours in it"
}

if ($Project -ne "") {
  npx tsx engine/cli.ts skill:install --dir (Join-Path $Project ".claude\skills")
} else {
  npx tsx engine/cli.ts skill:install
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
npx tsx engine/cli.ts doctor
Write-Host ""
Write-Host "* Done. Start a new Claude Code session in any repository and type /showcase." -ForegroundColor Green
Write-Host "  Try the demo first: npm run demo" -ForegroundColor DarkGray
Write-Host ""
