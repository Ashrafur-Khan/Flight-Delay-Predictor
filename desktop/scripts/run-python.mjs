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
const pythonCommand = (process.platform === 'darwin' ? process.env.FLIGHT_DELAY_DESKTOP_PYTHON : null)
  || process.env.PYTHON
  || (fs.existsSync(localVenvPython) ? localVenvPython : null)
  || (process.platform === 'win32' ? 'python' : 'python3');
const forwardedArgs = process.argv.slice(2);

const result = spawnSync(pythonCommand, forwardedArgs, {
  cwd: repoRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    PYTHON: pythonCommand,
    PYINSTALLER_CONFIG_DIR: pyInstallerConfigDir,
  },
});

process.exit(result.status ?? 1);
