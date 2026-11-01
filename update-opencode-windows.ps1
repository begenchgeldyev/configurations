#requires -Version 5.1
<#
.SYNOPSIS
Update only OpenCode configuration and its proxy URL on Windows.
.EXAMPLE
.\update-opencode-windows.ps1
.EXAMPLE
.\update-opencode-windows.ps1 -VpsUrl "http://208.92.227.18:8317/v1"
#>
[CmdletBinding()]
param(
    [string]$ConfigDirectory,
    [string]$VpsUrl = 'http://208.92.227.18:8317/v1',
    [switch]$SkipRestart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw 'Run this script in Windows PowerShell or PowerShell on Windows.'
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'Git is required. Install Git for Windows, then open PowerShell again.'
}

$parsedUrl = $null
if (-not [Uri]::TryCreate($VpsUrl, [UriKind]::Absolute, [ref]$parsedUrl) -or
    $parsedUrl.Scheme -notin @('http', 'https') -or
    $parsedUrl.UserInfo -or $parsedUrl.Query -or $parsedUrl.Fragment -or
    $parsedUrl.AbsolutePath.TrimEnd('/') -ne '/v1') {
    throw 'VpsUrl must be an HTTP(S) API endpoint ending in /v1, without credentials, a query, or a fragment.'
}
$VpsUrl = $parsedUrl.AbsoluteUri.TrimEnd('/')

if (-not $ConfigDirectory) {
    if ($env:XDG_CONFIG_HOME) {
        $ConfigDirectory = Join-Path $env:XDG_CONFIG_HOME 'opencode'
    } else {
        $ConfigDirectory = Join-Path $HOME '.config\opencode'
    }
}
$ConfigDirectory = [IO.Path]::GetFullPath($ConfigDirectory)
$repositoryUrl = 'https://github.com/begenchgeldyev/configurations.git'

function Invoke-Git {
    param([string[]]$GitArguments)
    & git @GitArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Git failed with exit code $LASTEXITCODE. Resolve the reported problem and rerun the script."
    }
}

$temporaryCheckout = Join-Path ([IO.Path]::GetTempPath()) ('opencode-update-' + [Guid]::NewGuid().ToString('N'))
try {
    Write-Host 'Fetching the OpenCode configuration directory ...'
    Invoke-Git -GitArguments @('clone', '--depth', '1', '--filter=blob:none', '--no-checkout', '--branch', 'master', $repositoryUrl, $temporaryCheckout)
    Invoke-Git -GitArguments @('-C', $temporaryCheckout, 'sparse-checkout', 'set', '--no-cone', '/.config/opencode/')
    Invoke-Git -GitArguments @('-C', $temporaryCheckout, 'checkout', 'master')
    $source = Join-Path $temporaryCheckout '.config\opencode'

    # Adapt the repository's Linux-specific paths before applying the config.
    $configPath = Join-Path $source 'opencode.json'
    $configText = [IO.File]::ReadAllText($configPath)
    $configText = $configText.Replace('/home/begench/', ($HOME.Replace('\', '/') + '/'))
    $config = $configText | ConvertFrom-Json
    $config.mcp.'chrome-devtools'.command = @($config.mcp.'chrome-devtools'.command | Where-Object { $_ -ne '--executablePath=/usr/bin/chromium' })
    [IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 100), (New-Object Text.UTF8Encoding($false)))

    $cliPath = Join-Path $source 'cli.json'
    $cli = [IO.File]::ReadAllText($cliPath) | ConvertFrom-Json
    if (-not (Test-Path -LiteralPath (Join-Path $ConfigDirectory 'herdr-opencode'))) {
        $cli.plugins = @($cli.plugins | Where-Object { $_ -ne './herdr-opencode' })
    }
    [IO.File]::WriteAllText($cliPath, ($cli | ConvertTo-Json -Depth 100), (New-Object Text.UTF8Encoding($false)))

    New-Item -ItemType Directory -Path $ConfigDirectory -Force | Out-Null
    Get-ChildItem -LiteralPath $source -Force |
        Where-Object { $_.Name -ne '.env' } |
        Copy-Item -Destination $ConfigDirectory -Recurse -Force
    Write-Host "Updated OpenCode configuration in $ConfigDirectory"
} finally {
    if (Test-Path -LiteralPath $temporaryCheckout) {
        Remove-Item -LiteralPath $temporaryCheckout -Recurse -Force
    }
}

function Update-ProxyEnvFile {
    param([string]$Path, [string]$Url)
    $text = ''
    if (Test-Path -LiteralPath $Path) {
        $text = [IO.File]::ReadAllText($Path)
    }
    $newline = "`r`n"
    if ($text.Contains("`n") -and -not $text.Contains("`r`n")) { $newline = "`n" }
    $pattern = '(?m)^[\t ]*(?:export[\t ]+)?VPS_IP[\t ]*=[^\r\n]*'
    $assignment = "VPS_IP=$Url"
    if ([regex]::IsMatch($text, $pattern)) {
        $text = [regex]::Replace($text, $pattern, [Text.RegularExpressions.MatchEvaluator]{ param($match) $assignment })
    } else {
        if ($text.Length -gt 0 -and -not $text.EndsWith("`n")) { $text += $newline }
        $text += $assignment + $newline
    }
    [IO.File]::WriteAllText($Path, $text, (New-Object Text.UTF8Encoding($false)))
    Write-Host "Updated $Path"
}

# User scope survives new terminals and Desktop launches; Process scope is used
# by the backend restarted below. No API keys are read from Git or printed.
[Environment]::SetEnvironmentVariable('VPS_IP', $VpsUrl, 'User')
$env:VPS_IP = $VpsUrl

$envFiles = @((Join-Path $HOME '.env'))
$candidate = Join-Path $ConfigDirectory '.env'
if (Test-Path -LiteralPath $candidate -PathType Leaf) { $envFiles += $candidate }
foreach ($path in ($envFiles | Select-Object -Unique)) {
    Update-ProxyEnvFile -Path $path -Url $VpsUrl
}

Write-Host "VPS_IP is now $VpsUrl"
if (-not $SkipRestart -and (Get-Command opencode -ErrorAction SilentlyContinue)) {
    Write-Host 'Restarting the OpenCode backend ...'
    & opencode service restart
    if ($LASTEXITCODE -ne 0) {
        throw 'OpenCode configuration and VPS_IP were updated, but the backend restart failed. Run: opencode service restart'
    }
} else {
    Write-Host 'Restart the OpenCode backend or reopen OpenCode Desktop to use the updated environment.'
}
Write-Host 'Update complete.'
