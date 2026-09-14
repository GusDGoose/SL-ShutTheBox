<#
.SYNOPSIS
Saves the Teams webhook URL to Vercel production — but posts a test card
first, and refuses to save a URL that did not work.

.DESCRIPTION
The bash version of this asked for the URL at a hidden prompt, which turned
out to be the wrong way to receive a secret on Windows: Git Bash does not
paste with Ctrl+V, and a paste that never arrived looked exactly like a paste
that arrived malformed.

This reads the clipboard instead. You already pressed "Kopiera webhook-länk"
in Teams, so the URL is sitting there — nothing to paste at all.

PRODUCTION ONLY, on purpose: preview deployments point at the same Supabase
project, so giving them the webhook too would let a test deploy post real
cards into the team's channel.

.EXAMPLE
.\Set-TeamsWebhook.ps1
Reads the URL from the clipboard.

.EXAMPLE
.\Set-TeamsWebhook.ps1 -Url "https://..."
.EXAMPLE
.\Set-TeamsWebhook.ps1 -Path .\url.txt

.EXAMPLE
.\Set-TeamsWebhook.ps1 -TestOnly
Posts the test card and stops, without touching Vercel.
#>
#Requires -Version 7
[CmdletBinding()]
param(
    [string] $Url,
    [string] $Path,
    [switch] $TestOnly
)

$ErrorActionPreference = 'Stop'

function Write-Step { param($m) Write-Host $m -ForegroundColor Cyan }
function Write-Ok   { param($m) Write-Host $m -ForegroundColor Green }
function Write-Bad  { param($m) Write-Host $m -ForegroundColor Red }

# Pull the first https link out of whatever we were handed. Terminals wrap
# pasted text in bracketed-paste escapes and people paste with quotes or a
# trailing newline; none of that should be the user's problem.
function Get-CleanUrl {
    param([string] $Text)
    if ([string]::IsNullOrWhiteSpace($Text)) { return $null }
    $stripped = [regex]::Replace($Text, "`e\[[0-9;]*[~a-zA-Z]", '')
    $match = [regex]::Match($stripped, 'https://[^\s"''<>]+')
    if ($match.Success) { return $match.Value }
    return $null
}

Write-Host ''
Write-Host 'Shut the Box — Teams webhook setup' -ForegroundColor White
Write-Host ''

# ---------------------------------------------------------------------------
# Where the URL comes from
# ---------------------------------------------------------------------------
$source = $null
$resolved = $null

if ($Url)  { $resolved = Get-CleanUrl $Url;  $source = 'the -Url argument' }
elseif ($Path) {
    if (-not (Test-Path -LiteralPath $Path)) { Write-Bad "No such file: $Path"; exit 1 }
    $resolved = Get-CleanUrl (Get-Content -LiteralPath $Path -Raw)
    $source = "the file $Path"
}
else {
    try { $clip = Get-Clipboard -Raw } catch { $clip = $null }
    $resolved = Get-CleanUrl $clip
    if ($resolved) {
        $source = 'your clipboard'
    } else {
        # Visible on purpose. A hidden prompt is where the bash version kept
        # failing silently: you could not see whether the paste had landed.
        Write-Host 'No https:// link on the clipboard.'
        Write-Host 'Paste it here (Ctrl+V works in PowerShell) and press Enter:'
        $typed = Read-Host '  URL'
        $resolved = Get-CleanUrl $typed
        $source = 'what you typed'
    }
}

if (-not $resolved) {
    Write-Bad 'No https:// link found. Nothing was saved.'
    Write-Host 'Copy the link from Teams (Kopiera webhook-länk) and run this again,'
    Write-Host 'or pass it directly:  .\Set-TeamsWebhook.ps1 -Url "https://..."'
    exit 1
}

Write-Ok  ("Got the URL from {0} ({1} characters)." -f $source, $resolved.Length)

# Microsoft has used several hosts for these: logic.azure.com for the original
# Logic Apps triggers, *.environment.api.powerplatform.com for the Power
# Platform ones Teams hands out now. Anything else is worth a word, not a veto.
if ($resolved -notmatch 'logic\.azure\.com|azure-apihub\.net|powerplatform\.com') {
    Write-Host 'Note: that host is not one Teams usually gives out — carrying on anyway.' -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# The test card — the same envelope src/lib/teams.ts sends
# ---------------------------------------------------------------------------
$card = @{
    type        = 'message'
    attachments = @(
        @{
            contentType = 'application/vnd.microsoft.card.adaptive'
            content     = @{
                '$schema' = 'http://adaptivecards.io/schemas/adaptive-card.json'
                type      = 'AdaptiveCard'
                version   = '1.4'
                body      = @(
                    @{ type = 'TextBlock'; size = 'Large'; weight = 'Bolder'; wrap = $true
                       text = '🎲 Shut the Box är igång' },
                    @{ type = 'TextBlock'; wrap = $true
                       text = 'Det här är ett testkort. Vinnarkorten ser ut så här — namn, poäng, svit, och 📦 när lådan stängs.' }
                )
            }
        }
    )
}

$json = $card | ConvertTo-Json -Depth 10 -Compress
# [concept: Constrained Language Mode] This machine runs PowerShell under a
# WDAC/AppLocker policy, so [System.Text.Encoding]::UTF8.GetBytes($json) — the
# obvious way to send exact bytes — is refused: "method invocation is
# supported only on core types in this language mode". Nothing here may call
# arbitrary .NET.
#
# Naming the charset in the Content-Type is enough: PowerShell 7 encodes a
# string body with the encoding the content type declares, so the emoji
# survive without a single method call.

Write-Step 'Posting a test card...'
$posted = $false
try {
    $response = Invoke-WebRequest -Uri $resolved -Method Post -Body $json `
        -ContentType 'application/json; charset=utf-8' -TimeoutSec 20
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
        Write-Ok ("The webhook accepted it (HTTP {0}) — go and look at the channel." -f $response.StatusCode)
        $posted = $true
    }
} catch {
    $status = $null
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    if ($status) { Write-Bad "The webhook rejected it (HTTP $status). Nothing has been saved." }
    else { Write-Bad ("Could not reach the webhook: {0}" -f $_.Exception.Message) }
    exit 1
}
if (-not $posted) { Write-Bad 'The webhook did not accept the card. Nothing has been saved.'; exit 1 }

if ($TestOnly) {
    Write-Host ''
    Write-Ok '-TestOnly, so stopping here. Vercel was not touched.'
    exit 0
}

# ---------------------------------------------------------------------------
# Only now, and only if a human confirms the card actually landed
# ---------------------------------------------------------------------------
Write-Host ''
$saw = Read-Host 'Did the card appear in the channel? [y/N]'
if ($saw -notmatch '^(y|yes|j|ja)$') {
    Write-Bad 'Not saving, then.'
    Write-Host 'The flow accepted the POST but the card never landed, which usually'
    Write-Host 'means the flow is turned off or points at a different channel.'
    exit 1
}

# .vercel/project.json lives in the main checkout, never in a worktree.
$repoRoot = (& git rev-parse --path-format=absolute --git-common-dir 2>$null)
if ($LASTEXITCODE -eq 0 -and $repoRoot) { $repoRoot = Split-Path -Parent $repoRoot }
else { $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path }

if (-not (Test-Path (Join-Path $repoRoot '.vercel\project.json'))) {
    Write-Bad "No .vercel\project.json under $repoRoot."
    Write-Host "Run 'vercel link' there first, or the CLI just prints"
    Write-Host "'Retrieving project...' and returns nothing."
    exit 1
}

# npx re-checks the npm registry on every call and hangs on a slow link, so
# prefer a binary that is already cached.
$vercelExe = (Get-Command vercel -ErrorAction SilentlyContinue)
$cached = Get-ChildItem -Path 'C:\IT\npm-cache\_npx', "$env:USERPROFILE\AppData\Local\npm-cache\_npx" `
    -Filter 'index.js' -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -like '*node_modules\vercel\dist\index.js' } |
    Select-Object -First 1

Write-Step 'Saving to Vercel production...'
try {
    if ($vercelExe) {
        $resolved | & vercel --cwd $repoRoot env add TEAMS_WEBHOOK_URL production --force
    } elseif ($cached) {
        $resolved | & node $cached.FullName --cwd $repoRoot env add TEAMS_WEBHOOK_URL production --force
    } else {
        $resolved | & npx --yes vercel --cwd $repoRoot env add TEAMS_WEBHOOK_URL production --force
    }
    if ($LASTEXITCODE -ne 0) { throw "the Vercel CLI exited $LASTEXITCODE" }
} catch {
    Write-Bad ("Could not save it: {0}" -f $_.Exception.Message)
    Write-Host 'Add it by hand instead: Vercel -> Settings -> Environment Variables,'
    Write-Host 'name TEAMS_WEBHOOK_URL, Production only.'
    exit 1
}

Write-Ok 'Saved: TEAMS_WEBHOOK_URL (production)'
Write-Host ''
Write-Host 'It only takes effect on the NEXT deployment. Redeploy with:'
Write-Host ("  vercel --cwd {0} --prod" -f $repoRoot)
Write-Host 'or push any commit to main.'
Write-Host ''
Write-Host 'Then confirm:'
Write-Host '  curl.exe -sS https://sl-shut-the-box-opal.vercel.app/api/health'
Write-Host 'should show "TEAMS_WEBHOOK_URL_set": true — and the next crowned game posts a card.'
