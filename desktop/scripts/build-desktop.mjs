import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '..', '..');
const pyInstallerConfigDir = path.join(repoRoot, 'desktop', '.pyinstaller');
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
    env: {
      ...process.env,
      PYINSTALLER_CONFIG_DIR: pyInstallerConfigDir,
    },
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(process.execPath, ['desktop/scripts/clean.mjs']);
run(process.execPath, ['desktop/scripts/stage-release-model.mjs']);
run(pythonCommand, ['desktop/scripts/validate_backend_release.py']);
run(npmCommand, ['--prefix', 'flight-delay-prediction-form', 'run', 'build']);
run(pythonCommand, ['-m', 'PyInstaller', '--noconfirm', '--clean', '--distpath', 'desktop/dist/backend', 'desktop/pyinstaller/backend.spec']);
run(pythonCommand, ['desktop/scripts/smoke_test_backend.py']);
run(npmCommand, ['exec', 'electron-builder', '--', '--config', 'desktop/electron-builder.yml', '--publish', 'never']);
