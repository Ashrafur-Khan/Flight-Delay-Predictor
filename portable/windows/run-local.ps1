param(
  [int]$Port = 8000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Get-ReleaseManifest {
  $manifestPath = Join-Path $Root 'release-manifest.json'
  if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Missing release-manifest.json in $Root."
  }

  return Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
}

function Get-NormalizedSha256 {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Assert-PortAvailable {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Port
  )

  $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() |
    Where-Object { $_.Port -eq $Port }
  if ($listeners) {
    throw "Port $Port is already in use on this machine. Run run-local.ps1 -Port <another port>."
  }
}

function Test-ModelArtifact {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PythonPath,
    [Parameter(Mandatory = $true)]
    [string]$ModelPath
  )

  $validationScript = (@'
from pathlib import Path
from backend.model_service import load_model_artifact

artifact = load_model_artifact(Path(r"MODEL_PATH_PLACEHOLDER"))
if artifact is None:
    raise SystemExit("Model artifact is incompatible with runtime expectations.")
'@).Replace('MODEL_PATH_PLACEHOLDER', $ModelPath.Replace('\', '\\'))

  & $PythonPath -c $validationScript
  if ($LASTEXITCODE -ne 0) {
    throw 'The local model artifact failed validation. Rerun setup-local.cmd.'
  }
}

function Wait-ForBackendHealth {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl,
    [Parameter(Mandatory = $true)]
    [System.Diagnostics.Process]$BackendProcess,
    [int]$TimeoutSeconds = 45
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $BackendProcess.Refresh()
    if ($BackendProcess.HasExited) {
      throw "The portable backend exited before becoming healthy. Exit code: $($BackendProcess.ExitCode)."
    }

    try {
      $payload = Invoke-RestMethod -Uri "$BaseUrl/" -Method Get -TimeoutSec 2
      if ($payload.modelLoaded -ne $true) {
        throw 'Portable backend started without a trained model artifact.'
      }

      return $payload
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }

  throw "Timed out waiting for the portable backend at $BaseUrl."
}

$manifest = Get-ReleaseManifest
$venvPython = Join-Path $Root '.venv\Scripts\python.exe'
$modelFileName = if ($manifest.modelFileName) { [string]$manifest.modelFileName } else { 'model.pkl' }
$modelPath = Join-Path $Root (Join-Path 'backend' $modelFileName)
$expectedSha = ([string]$manifest.modelSha256).Trim().ToLowerInvariant()
$baseUrl = "http://127.0.0.1:$Port"
$appUrl = "$baseUrl/app/"

if (-not (Test-Path -LiteralPath $venvPython)) {
  throw 'Missing .venv\Scripts\python.exe. Run setup-local.cmd first.'
}

if (-not (Test-Path -LiteralPath $modelPath)) {
  throw "Missing backend\$modelFileName. Run setup-local.cmd first."
}

$actualSha = Get-NormalizedSha256 -Path $modelPath
if ($actualSha -ne $expectedSha) {
  throw "Model checksum mismatch for backend\$modelFileName. Run setup-local.cmd again."
}

Test-ModelArtifact -PythonPath $venvPython -ModelPath $modelPath
Assert-PortAvailable -Port $Port

$backendArgs = @('-m', 'backend.portable_entry', '--port', "$Port")
$backendProcess = $null

try {
  $backendProcess = Start-Process -FilePath $venvPython -ArgumentList $backendArgs -WorkingDirectory $Root -NoNewWindow -PassThru
  $null = Wait-ForBackendHealth -BaseUrl $baseUrl -BackendProcess $backendProcess

  Start-Process $appUrl | Out-Null
  Write-Host "Portable app is running at $appUrl"
  Write-Host 'Press Ctrl+C to stop the local backend.'

  Wait-Process -Id $backendProcess.Id
  $backendProcess.Refresh()
  if ($backendProcess.ExitCode -ne 0) {
    throw "The portable backend exited with code $($backendProcess.ExitCode)."
  }
} finally {
  if ($null -ne $backendProcess) {
    $backendProcess.Refresh()
    if (-not $backendProcess.HasExited) {
      Stop-Process -Id $backendProcess.Id -Force
    }
  }
}
