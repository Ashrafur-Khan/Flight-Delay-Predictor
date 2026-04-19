import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '..');
const packageJsonPath = path.join(repoRoot, 'package.json');
const frontendBuildDir = path.join(repoRoot, 'flight-delay-prediction-form', 'build');
const portableSourceDir = path.join(repoRoot, 'portable', 'windows');
const portableDistDir = path.join(repoRoot, 'portable', 'dist');
const portableStagingRoot = path.join(portableDistDir, 'staging');
const localVenvPython = process.platform === 'win32'
  ? path.join(repoRoot, '.venv', 'Scripts', 'python.exe')
  : path.join(repoRoot, '.venv', 'bin', 'python');
const pythonCommand = process.env.PYTHON
  || (fs.existsSync(localVenvPython) ? localVenvPython : null)
  || (process.platform === 'win32' ? 'python' : 'python3');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (const argument of argv) {
    if (!argument.startsWith('--')) {
      continue;
    }

    const [rawKey, ...rawValue] = argument.slice(2).split('=');
    parsed[rawKey] = rawValue.join('=');
  }
  return parsed;
}

function requireArg(args, key) {
  const value = args[key]?.trim();
  if (!value) {
    console.error(`Missing required argument --${key}=...`);
    process.exit(1);
  }
  return value;
}

function assertSha256(value) {
  if (!/^[a-fA-F0-9]{64}$/.test(value)) {
    console.error('model-sha256 must be a 64-character SHA-256 hex string.');
    process.exit(1);
  }
}

function copyDirectory(sourceDir, destinationDir, filter) {
  fs.cpSync(sourceDir, destinationDir, {
    recursive: true,
    filter,
  });
}

function copyPortableTemplate(sourceName, destinationName, stageDir) {
  fs.copyFileSync(
    path.join(portableSourceDir, sourceName),
    path.join(stageDir, destinationName),
  );
}

function createManifest({ version, releaseTag, modelUrl, modelSha256, modelFileName, pythonVersion }, stageDir) {
  const template = JSON.parse(
    fs.readFileSync(path.join(portableSourceDir, 'release-manifest.template.json'), 'utf8'),
  );

  const manifest = {
    ...template,
    version,
    releaseTag,
    modelUrl,
    modelSha256,
    modelFileName,
    pythonVersion,
  };

  fs.writeFileSync(
    path.join(stageDir, 'release-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
}

const args = parseArgs(process.argv.slice(2));
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = String(packageJson.version);
const defaultReleaseTag = `v${version}`;
const releaseTag = requireArg(args, 'release-tag');
const modelUrl = requireArg(args, 'model-url');
const modelSha256 = requireArg(args, 'model-sha256').toLowerCase();
const modelFileName = (args['model-file-name']?.trim() || path.basename(new URL(modelUrl).pathname) || 'model.pkl');
const pythonVersion = args['python-version']?.trim() || '3.11';

assertSha256(modelSha256);

if (releaseTag !== defaultReleaseTag) {
  console.error(`Release tag ${releaseTag} does not match package.json version ${version}. Expected ${defaultReleaseTag}.`);
  process.exit(1);
}

if (!fs.existsSync(portableSourceDir)) {
  console.error(`Portable source directory does not exist: ${portableSourceDir}`);
  process.exit(1);
}

run(npmCommand, ['--prefix', 'flight-delay-prediction-form', 'run', 'build']);

if (!fs.existsSync(frontendBuildDir)) {
  console.error(`Frontend build output was not found at ${frontendBuildDir}`);
  process.exit(1);
}

const stageFolderName = `flight-delay-predictor-portable-windows-${releaseTag}`;
const stageDir = path.join(portableStagingRoot, stageFolderName);
const zipPath = path.join(portableDistDir, `${stageFolderName}.zip`);

fs.rmSync(stageDir, { recursive: true, force: true });
fs.rmSync(zipPath, { force: true });
fs.mkdirSync(stageDir, { recursive: true });

copyDirectory(
  path.join(repoRoot, 'backend'),
  path.join(stageDir, 'backend'),
  (source) => {
    const normalized = source.replaceAll('\\', '/');
    const baseName = path.basename(source);
    if (baseName === '__pycache__' || baseName.endsWith('.pyc')) {
      return false;
    }
    if (normalized.endsWith('/backend/model.pkl')) {
      return false;
    }
    return true;
  },
);

fs.copyFileSync(path.join(repoRoot, 'requirements.txt'), path.join(stageDir, 'requirements.txt'));
copyPortableTemplate('setup-local.ps1', 'setup-local.ps1', stageDir);
copyPortableTemplate('setup-local.cmd', 'setup-local.cmd', stageDir);
copyPortableTemplate('run-local.ps1', 'run-local.ps1', stageDir);
copyPortableTemplate('run-local.cmd', 'run-local.cmd', stageDir);
copyPortableTemplate('README.windows.md', 'README.windows.md', stageDir);

copyDirectory(
  frontendBuildDir,
  path.join(stageDir, 'portable', 'frontend'),
  (source) => {
    const baseName = path.basename(source);
    return baseName !== '.DS_Store';
  },
);

createManifest(
  {
    version,
    releaseTag,
    modelUrl,
    modelSha256,
    modelFileName,
    pythonVersion,
  },
  stageDir,
);

fs.mkdirSync(portableDistDir, { recursive: true });
run(
  pythonCommand,
  ['-m', 'zipfile', '-c', zipPath, stageFolderName],
  { cwd: portableStagingRoot },
);

console.log(`Portable Windows ZIP created at ${zipPath}`);
