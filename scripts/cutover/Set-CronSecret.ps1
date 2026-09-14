<#
.SYNOPSIS
Rotates CRON_SECRET: generates one, saves it to Vercel production, and puts
the matching Supabase Vault statement on your clipboard.

.DESCRIPTION
The scheduled jobs moved into the database (migration 0020), so the bearer
token now has to exist in two places: Vercel, where the endpoints check it,
and Supabase Vault, where pg_cron reads it to make the call.

The existing CRON_SECRET cannot be reused, because Vercel stores it as a
Secret — hidden in the dashboard and unavailable to `vercel env pull`. Nobody
can read it back, so the only way to get the same value into both places is
to set a new one in both.

Nothing is printed to the terminal, so the secret stays out of your scroll
history. It goes to Vercel over the CLI and to the clipboard for the one
paste the firewalled database needs.

.EXAMPLE
.\Set-CronSecret.ps1
#>
#Requires -Version 7
[CmdletBinding()]
param(
    [string] $AppUrl = 'https://sl-shut-the-box-opal.vercel.app',
    [switch] $WhatIfOnly
)

$ErrorActionPreference = 'Stop'

function Write-Ok  { param($m) Write-Host $m -ForegroundColor Green }
function Write-Bad { param($m) Write-Host $m -ForegroundColor Red }

Write-Host ''
Write-Host 'Shut the Box — rotating CRON_SECRET' -ForegroundColor White
Write-Host ''

# [concept: Constrained Language Mode] This machine forbids arbitrary .NET
# calls, so the usual [System.Web.Security.Membership]::GeneratePassword and
# RNGCryptoServiceProvider are both out. Get-Random is a cmdlet and a [char[]]
# cast is a core-type cast, which are allowed. Ambiguous glyphs (0/O, 1/l/I)
# are left out so the value survives being read aloud or retyped.
$alphabet = [char[]]'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
$secret = -join (1..48 | ForEach-Object { $alphabet | Get-Random })

Write-Host ("Generated a {0}-character secret." -f $secret.Length)

# BOTH statements, deliberately. The first time round the clipboard carried
# only the secret, and cron_settings was left empty — which makes
# run_scheduled_job warn and do nothing, silently, forever. The scheduler
# needs to know where to call as much as it needs the token.
$sql = @"
-- Shut the Box: what the scheduled jobs need. Paste BOTH statements into the
-- Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).

-- 1. Where to call. Not a secret, but it cannot live in the migration: local
--    development would then schedule jobs against production.
insert into cron_settings (app_url) values ('$AppUrl')
on conflict (id) do update set app_url = excluded.app_url, updated_at = now();

-- 2. The bearer token pg_cron presents to those endpoints.
select vault.create_secret('$secret', 'cron_secret', 'CRON_SECRET for the scheduled jobs');

-- If a secret by that name already exists, run this instead of the line above:
-- select vault.update_secret(id, '$secret') from vault.secrets where name = 'cron_secret';
"@

if ($WhatIfOnly) {
    Set-Clipboard -Value $sql
    Write-Ok 'Vault SQL copied to the clipboard. Vercel was NOT touched (-WhatIfOnly).'
    exit 0
}

# .vercel/project.json lives in the main checkout, never in a worktree.
$repoRoot = (& git rev-parse --path-format=absolute --git-common-dir 2>$null)
if ($LASTEXITCODE -eq 0 -and $repoRoot) { $repoRoot = Split-Path -Parent $repoRoot }
else { $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path }

if (-not (Test-Path (Join-Path $repoRoot '.vercel\project.json'))) {
    Write-Bad "No .vercel\project.json under $repoRoot. Run 'vercel link' there first."
    exit 1
}

$vercelExe = (Get-Command vercel -ErrorAction SilentlyContinue)
$cached = Get-ChildItem -Path 'C:\IT\npm-cache\_npx', "$env:USERPROFILE\AppData\Local\npm-cache\_npx" `
    -Filter 'index.js' -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -like '*node_modules\vercel\dist\index.js' } |
    Select-Object -First 1

Write-Host 'Saving to Vercel production...'
try {
    if ($vercelExe)    { $secret | & vercel --cwd $repoRoot env add CRON_SECRET production --force }
    elseif ($cached)   { $secret | & node $cached.FullName --cwd $repoRoot env add CRON_SECRET production --force }
    else               { $secret | & npx --yes vercel --cwd $repoRoot env add CRON_SECRET production --force }
    if ($LASTEXITCODE -ne 0) { throw "the Vercel CLI exited $LASTEXITCODE" }
} catch {
    Write-Bad ("Could not save it: {0}" -f $_.Exception.Message)
    Write-Host 'Nothing else has been done — the old secret is still in place.'
    exit 1
}

Set-Clipboard -Value $sql

Write-Ok 'Saved: CRON_SECRET (production)'
Write-Ok 'The matching Vault statement is now on your clipboard.'
Write-Host ''
Write-Host 'Next:'
Write-Host '  1. Supabase -> SQL Editor -> New query -> paste (Ctrl+V) -> Run'
Write-Host '     (two statements: where to call, and the token to call with)'
Write-Host '  2. Redeploy, so the app picks up the new secret:'
Write-Host ("     vercel --cwd {0} --prod" -f $repoRoot)
Write-Host ''
Write-Host 'Until BOTH are done the scheduled jobs get a 401 and post nothing.'
Write-Host 'Crowning a game still posts its winner card the whole time — that'
Write-Host 'path does not use CRON_SECRET.'
