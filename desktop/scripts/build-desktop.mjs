import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '..', '..');
const pyInstallerConfigDir = path.join(repoRoot, 'desktop', '.pyinstaller');
const frontendBuildDir = path.join(repoRoot, 'flight-delay-prediction-form', 'build');
const installersDir = path.join(repoRoot, 'desktop', 'dist', 'installers');
const backendBundleDir = path.join(repoRoot, 'desktop', 'dist', 'backend', 'server');
const electronBuilderCli = path.join(repoRoot, 'node_modules', 'electron-builder', 'cli.js');

function resolveDefaultPythonCommand() {
  const localVenvPython = process.platform === 'win32'
    ? path.join(repoRoot, '.venv', 'Scripts', 'python.exe')
    : path.join(repoRoot, '.venv', 'bin', 'python');
  return process.env.PYTHON
    || (fs.existsSync(localVenvPython) ? localVenvPython : null)
    || (process.platform === 'win32' ? 'python' : 'python3');
}

function resolveDesktopPythonCommand() {
  if (process.platform === 'darwin') {
    const configuredPython = process.env.FLIGHT_DELAY_DESKTOP_PYTHON;
    if (!configuredPython) {
      console.error(
        'macOS desktop builds require FLIGHT_DELAY_DESKTOP_PYTHON to point to a pinned Python 3.12 runtime.',
      );
      process.exit(1);
    }
    return configuredPython;
  }

  return resolveDefaultPythonCommand();
}

const pythonCommand = resolveDesktopPythonCommand();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      PYTHON: pythonCommand,
      PYINSTALLER_CONFIG_DIR: pyInstallerConfigDir,
    },
    ...options,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runNpm(args, options = {}) {
  if (process.platform === 'win32') {
    run('cmd.exe', ['/d', '/s', '/c', 'npm.cmd', ...args], options);
    return;
  }

  run('npm', args, options);
}

function assertFrontendBuildExists() {
  const indexPath = path.join(frontendBuildDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    console.error(`Frontend build output was not found at ${indexPath}`);
    process.exit(1);
  }
}

function resolveInstallerExtension() {
  if (process.platform === 'win32') {
    return '.exe';
  }
  if (process.platform === 'darwin') {
    return '.dmg';
  }
  return '.AppImage';
}

function resolveElectronBuilderArgs() {
  const args = [electronBuilderCli, '--config', 'desktop/electron-builder.yml', '--publish', 'never'];

  if (process.platform === 'win32') {
    return [...args, '--win', 'nsis'];
  }
  if (process.platform === 'darwin') {
    return [...args, '--mac', 'dmg'];
  }
  return [...args, '--linux', 'AppImage'];
}

function assertInstallerExists() {
  const extension = resolveInstallerExtension();
  if (!fs.existsSync(installersDir)) {
    console.error(`Installer output directory was not created: ${installersDir}`);
    process.exit(1);
  }

  const installerCandidates = fs.readdirSync(installersDir)
    .filter((entry) => entry.endsWith(extension))
    .filter((entry) => !entry.endsWith(`${extension}.blockmap`));

  if (installerCandidates.length === 0) {
    console.error(`Electron packaging completed without producing a ${extension} installer in ${installersDir}`);
    process.exit(1);
  }
}

function resolveBuiltAppPath() {
  if (process.platform !== 'darwin') {
    return null;
  }

  const appRoot = path.join(installersDir, 'mac-arm64');
  if (!fs.existsSync(appRoot)) {
    console.error(`macOS app output directory was not created: ${appRoot}`);
    process.exit(1);
  }

  const apps = fs.readdirSync(appRoot).filter((entry) => entry.endsWith('.app'));
  if (apps.length !== 1) {
    console.error(`Expected exactly one packaged .app bundle in ${appRoot}, found ${apps.length}.`);
    process.exit(1);
  }

  return path.join(appRoot, apps[0]);
}

run(process.execPath, ['desktop/scripts/clean.mjs']);
if (process.platform === 'darwin') {
  run(pythonCommand, ['desktop/scripts/validate_desktop_python.py']);
}
run(process.execPath, ['desktop/scripts/stage-release-model.mjs']);
run(pythonCommand, ['desktop/scripts/validate_backend_release.py']);
runNpm(['--prefix', 'flight-delay-prediction-form', 'run', 'build']);
assertFrontendBuildExists();
run(pythonCommand, ['-m', 'PyInstaller', '--noconfirm', '--clean', '--distpath', 'desktop/dist/backend', 'desktop/pyinstaller/backend.spec']);
if (process.platform === 'darwin') {
  run(pythonCommand, ['desktop/scripts/validate_macos_bundle.py', '--path', backendBundleDir, '--require-signature']);
}
run(pythonCommand, ['desktop/scripts/smoke_test_backend.py']);
run(process.execPath, resolveElectronBuilderArgs());
assertInstallerExists();
if (process.platform === 'darwin') {
  const appPath = resolveBuiltAppPath();
  run(pythonCommand, [
    'desktop/scripts/validate_macos_bundle.py',
    '--path',
    path.join(appPath, 'Contents', 'Resources', 'backend'),
    '--require-signature',
  ]);
  run(process.execPath, ['desktop/scripts/verify-macos-release.mjs', appPath]);
}
