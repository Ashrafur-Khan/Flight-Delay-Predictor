const { app, BrowserWindow, net, protocol } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const nodeNet = require('node:net');
const { pathToFileURL } = require('node:url');

const APP_ORIGIN = 'app://-';
const INDEX_URL = `${APP_ORIGIN}/index.html`;
const RUNTIME_ARG_PREFIX = '--flight-delay-runtime-config=';
const BACKEND_EXECUTABLE = process.platform === 'win32'
  ? 'flight-delay-backend.exe'
  : 'flight-delay-backend';
const BACKEND_LOG_FILE_NAME = 'backend-startup.log';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

let mainWindow = null;
let backendProcess = null;
let backendStartupLogs = [];
let backendLaunchDiagnostic = null;
let backendExitDetails = null;
let runtimeConfig = buildRuntimeConfig();

function buildRuntimeConfig(overrides = {}) {
  return {
    runtimeTarget: 'desktop',
    apiBaseUrl: null,
    backendStartupError: null,
    backendStartup: null,
    ...overrides,
  };
}

function getRepoRoot() {
  return path.resolve(__dirname, '..');
}

function getRendererDistPath() {
  return path.resolve(__dirname, '..', 'flight-delay-prediction-form', 'build');
}

function getDesktopLogFilePath() {
  return path.join(app.getPath('userData'), 'logs', BACKEND_LOG_FILE_NAME);
}

function ensureDesktopLogFile() {
  const logPath = getDesktopLogFilePath();
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  return logPath;
}

function resetDesktopLogFile() {
  fs.writeFileSync(ensureDesktopLogFile(), '', 'utf8');
}

function appendDesktopLog(message) {
  const trimmed = String(message).trim();
  if (!trimmed) {
    return;
  }

  fs.appendFileSync(ensureDesktopLogFile(), `${trimmed}\n`, 'utf8');
}

function getBundledBackendExecutablePath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'backend', BACKEND_EXECUTABLE)
    : 'Local Python module backend.desktop_entry';
}

function createBackendStartupDiagnostic(code, message, options = {}) {
  return {
    code,
    title: options.title ?? 'The local prediction service did not start.',
    message,
    technicalSummary: options.technicalSummary ?? null,
    backendExecutablePath: options.backendExecutablePath ?? getBundledBackendExecutablePath(),
    logPath: options.logPath ?? getDesktopLogFilePath(),
    exitCode: options.exitCode ?? null,
    signal: options.signal ?? null,
  };
}

function isBackendStartupDiagnostic(candidate) {
  return Boolean(
    candidate
    && typeof candidate === 'object'
    && typeof candidate.code === 'string'
    && typeof candidate.message === 'string'
    && typeof candidate.title === 'string',
  );
}

function applyBackendStartupDiagnostic(diagnostic) {
  runtimeConfig = buildRuntimeConfig({
    backendStartup: diagnostic ?? null,
    backendStartupError: diagnostic?.message ?? null,
  });
}

function ensureRendererBuildExists() {
  const rendererRoot = getRendererDistPath();
  const indexPath = path.join(rendererRoot, 'index.html');

  if (!fs.existsSync(indexPath)) {
    throw new Error(
      `Desktop renderer build is missing. Expected ${indexPath}. Run "npm run build:desktop" and make sure the frontend build completes successfully.`,
    );
  }

  return rendererRoot;
}

function getBackendSpawnCommand(port) {
  if (app.isPackaged) {
    return {
      command: path.join(process.resourcesPath, 'backend', BACKEND_EXECUTABLE),
      args: ['--port', String(port)],
      cwd: process.resourcesPath,
    };
  }

  const localVenvPython = process.platform === 'win32'
    ? path.join(getRepoRoot(), '.venv', 'Scripts', 'python.exe')
    : path.join(getRepoRoot(), '.venv', 'bin', 'python');
  const pythonCommand = process.env.PYTHON
    || (fs.existsSync(localVenvPython) ? localVenvPython : null)
    || (process.platform === 'win32' ? 'python' : 'python3');

  return {
    command: pythonCommand,
    args: ['-m', 'backend.desktop_entry', '--port', String(port)],
    cwd: getRepoRoot(),
  };
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = nodeNet.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Unable to allocate a local backend port.')));
        return;
      }

      const { port } = address;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(port);
      });
    });
  });
}

function pushBackendLog(stream, chunk) {
  const text = String(chunk).trim();
  if (!text) {
    return;
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const formattedLine = `[${new Date().toISOString()}] [${stream}] ${line}`;
    backendStartupLogs.push(formattedLine);
    appendDesktopLog(formattedLine);
  }
  backendStartupLogs = backendStartupLogs.slice(-20);
}

async function waitForBackendHealth(baseUrl, timeoutMs = 45000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (backendLaunchDiagnostic) {
      throw backendLaunchDiagnostic;
    }

    if (backendProcess && backendProcess.exitCode !== null) {
      throw createBackendStartupDiagnostic(
        'backend_exited_early',
        'The local prediction service exited before it became ready.',
        {
          technicalSummary: `Bundled backend exited before becoming healthy (code=${backendExitDetails?.code ?? 'unknown'}, signal=${backendExitDetails?.signal ?? 'none'}).`,
          exitCode: backendExitDetails?.code ?? null,
          signal: backendExitDetails?.signal ?? null,
        },
      );
    }

    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) {
        const payload = await response.json();
        if (!payload.modelLoaded) {
          throw createBackendStartupDiagnostic(
            'model_incompatible',
            'The local prediction service started without a compatible trained model artifact.',
            {
              technicalSummary: 'The packaged backend health check reported modelLoaded=false.',
            },
          );
        }
        return payload;
      }
    } catch (error) {
      if (isBackendStartupDiagnostic(error)) {
        throw error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const technicalSummary = backendStartupLogs.length > 0
    ? `Recent backend logs: ${backendStartupLogs.join(' | ')}`
    : 'No backend stdout or stderr was captured before the health check timed out.';

  throw createBackendStartupDiagnostic(
    'backend_unhealthy',
    'The local prediction service did not become healthy in time.',
    {
      technicalSummary,
    },
  );
}

async function stopBackendProcess() {
  if (!backendProcess) {
    return;
  }

  const processRef = backendProcess;
  backendProcess = null;

  if (processRef.exitCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    const forceKillTimer = setTimeout(() => {
      if (processRef.exitCode === null) {
        processRef.kill('SIGKILL');
      }
    }, 5000);

    processRef.once('exit', () => {
      clearTimeout(forceKillTimer);
      resolve();
    });

    processRef.kill('SIGTERM');
  });
}

async function startBackendProcess() {
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const { command, args, cwd } = getBackendSpawnCommand(port);

  resetDesktopLogFile();
  backendStartupLogs = [];
  backendLaunchDiagnostic = null;
  backendExitDetails = null;
  appendDesktopLog(
    `[${new Date().toISOString()}] Launching backend command: ${command} ${args.join(' ')}`,
  );

  backendProcess = spawn(command, args, {
    cwd,
    env: {
      ...process.env,
      FLIGHT_DELAY_ENV: 'production',
      FLIGHT_DELAY_ALLOW_HEURISTIC_FALLBACK: 'false',
      PYTHONUNBUFFERED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProcess.stdout?.on('data', (chunk) => {
    pushBackendLog('stdout', chunk);
    process.stdout.write(`[backend] ${chunk}`);
  });
  backendProcess.stderr?.on('data', (chunk) => {
    pushBackendLog('stderr', chunk);
    process.stderr.write(`[backend] ${chunk}`);
  });
  backendProcess.once('error', (error) => {
    backendLaunchDiagnostic = createBackendStartupDiagnostic(
      'launch_blocked',
      'The local prediction service could not be launched on this Mac.',
      {
        technicalSummary: `Unable to launch the bundled backend executable: ${error.message}`,
      },
    );
  });

  backendProcess.once('exit', (code, signal) => {
    backendExitDetails = { code, signal };
    appendDesktopLog(
      `[${new Date().toISOString()}] Backend process exited (code=${code}, signal=${signal ?? 'none'}).`,
    );
    if (!app.isQuitting) {
      console.error(`Bundled backend exited early (code=${code}, signal=${signal}).`);
    }
  });

  await waitForBackendHealth(baseUrl);
  runtimeConfig = buildRuntimeConfig({
    apiBaseUrl: baseUrl,
  });
}

function encodeRuntimeConfig() {
  return Buffer.from(JSON.stringify(runtimeConfig), 'utf8').toString('base64');
}

function resolveRendererAssetPath(requestPathname) {
  const rendererRoot = ensureRendererBuildExists();
  const normalizedPath = requestPathname === '/' ? '/index.html' : requestPathname;
  const candidatePath = path.resolve(rendererRoot, `.${decodeURIComponent(normalizedPath)}`);

  if (
    candidatePath.startsWith(rendererRoot)
    && fs.existsSync(candidatePath)
    && fs.statSync(candidatePath).isFile()
  ) {
    return candidatePath;
  }

  return path.join(rendererRoot, 'index.html');
}

function registerAppProtocol() {
  protocol.handle('app', (request) => {
    const requestUrl = new URL(request.url);
    const assetPath = resolveRendererAssetPath(requestUrl.pathname);
    return net.fetch(pathToFileURL(assetPath).toString());
  });
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    title: 'Flight Delay Predictor',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`${RUNTIME_ARG_PREFIX}${encodeRuntimeConfig()}`],
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  await mainWindow.loadURL(INDEX_URL);
}

async function bootstrapDesktopApp() {
  try {
    ensureRendererBuildExists();
    registerAppProtocol();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown desktop startup failure.';
    console.error(message);
    app.exit(1);
    return;
  }

  try {
    await startBackendProcess();
  } catch (error) {
    const diagnostic = isBackendStartupDiagnostic(error)
      ? error
      : createBackendStartupDiagnostic(
        'launch_blocked',
        'The local prediction service could not be launched on this Mac.',
        {
          technicalSummary: error instanceof Error ? error.message : 'Unknown backend startup failure.',
        },
      );
    console.error(diagnostic.technicalSummary ?? diagnostic.message);
    applyBackendStartupDiagnostic(diagnostic);
    await stopBackendProcess();
  }

  try {
    await createMainWindow();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown desktop window creation failure.';
    console.error(message);
    await stopBackendProcess();
    app.exit(1);
  }
}

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.whenReady().then(bootstrapDesktopApp);

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    await stopBackendProcess();
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createMainWindow();
  }
});

app.on('will-quit', async (event) => {
  if (backendProcess && backendProcess.exitCode === null) {
    event.preventDefault();
    await stopBackendProcess();
    app.quit();
  }
});
