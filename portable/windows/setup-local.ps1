param()

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

function Resolve-PythonCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RequiredVersion
  )

  $candidates = @(
    @{ Command = 'py'; PrefixArgs = @("-$RequiredVersion") },
    @{ Command = 'python'; PrefixArgs = @() },
    @{ Command = 'python3.11'; PrefixArgs = @() }
  )

  foreach ($candidate in $candidates) {
    try {
      $versionOutput = & $candidate.Command @($candidate.PrefixArgs + @('-c', 'import sys; print(".".join(map(str, sys.version_info[:3])))')) 2>$null
      if ($LASTEXITCODE -ne 0) {
        continue
      }

      $normalizedVersion = ($versionOutput | Select-Object -First 1).Trim()
      if ($normalizedVersion -match "^$([Regex]::Escape($RequiredVersion))\.") {
        return $candidate
      }
    } catch {
      continue
    }
  }

  throw "Python $RequiredVersion.x is required. Install Python $RequiredVersion for Windows and rerun setup-local."
}

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command,
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $Command $($Arguments -join ' ')"
  }
}

function Get-NormalizedSha256 {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
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

print(
    "Validated model artifact:",
    f"model={artifact.selected_model}",
    f"modelVersion={artifact.model_version}",
    f"datasetVersion={artifact.dataset_version}",
)
'@).Replace('MODEL_PATH_PLACEHOLDER', $ModelPath.Replace('\', '\\'))

  Invoke-CheckedCommand -Command $PythonPath -Arguments @('-c', $validationScript)
}

$manifest = Get-ReleaseManifest
$python = Resolve-PythonCommand -RequiredVersion $manifest.pythonVersion
$venvDir = Join-Path $Root '.venv'
$venvPython = Join-Path $venvDir 'Scripts\python.exe'
$modelFileName = if ($manifest.modelFileName) { [string]$manifest.modelFileName } else { 'model.pkl' }
$modelPath = Join-Path $Root (Join-Path 'backend' $modelFileName)
$expectedSha = ([string]$manifest.modelSha256).Trim().ToLowerInvariant()

if (-not $expectedSha) {
  throw 'release-manifest.json is missing modelSha256.'
}

Write-Host "Using Python $($manifest.pythonVersion).x"
Invoke-CheckedCommand -Command $python.Command -Arguments @($python.PrefixArgs + @('-m', 'venv', $venvDir))

if (-not (Test-Path -LiteralPath $venvPython)) {
  throw "Virtual environment was created, but $venvPython was not found."
}

Invoke-CheckedCommand -Command $venvPython -Arguments @('-m', 'pip', 'install', '--upgrade', 'pip')
Invoke-CheckedCommand -Command $venvPython -Arguments @('-m', 'pip', 'install', '-r', 'requirements.txt')

$downloadRequired = $true
if (Test-Path -LiteralPath $modelPath) {
  $existingSha = Get-NormalizedSha256 -Path $modelPath
  if ($existingSha -eq $expectedSha) {
    Write-Host "Model artifact already present with the expected checksum."
    $downloadRequired = $false
  } else {
    Write-Host 'Existing model checksum does not match the release manifest. Re-downloading model.pkl.'
  }
}

if ($downloadRequired) {
  Write-Host "Downloading model artifact from $($manifest.modelUrl)"
  Invoke-WebRequest -Uri ([string]$manifest.modelUrl) -OutFile $modelPath

  $downloadedSha = Get-NormalizedSha256 -Path $modelPath
  if ($downloadedSha -ne $expectedSha) {
    throw "Downloaded model checksum mismatch. Expected $expectedSha but received $downloadedSha."
  }
}

Test-ModelArtifact -PythonPath $venvPython -ModelPath $modelPath
Write-Host 'Portable setup completed successfully.'
