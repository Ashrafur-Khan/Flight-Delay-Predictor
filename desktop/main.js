const { app, BrowserWindow, ipcMain, net, protocol } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const nodeNet = require('node:net');
const { pathToFileURL } = require('node:url');

const {
  BACKEND_RESTART_DELAYS_MS,
  createBackendStatus,
  focusWindow,
  getRecoveryStatus,
  getRestartDelayMs,
} = require('./runtimeHelpers');

const APP_ORIGIN = 'app://-';
const INDEX_URL = `${APP_ORIGIN}/index.html`;
const RUNTIME_ARG_PREFIX = '--flight-delay-runtime-config=';
const BACKEND_STATUS_CHANNEL = 'flight-delay-backend-status';
const BACKEND_ENSURE_READY_CHANNEL = 'flight-delay-backend-ensure-ready';
const BACKEND_EXECUTABLE = process.platform === 'win32'
  ? 'flight-delay-backend.exe'
  : 'flight-delay-backend';
const MAX_BACKEND_RESTART_ATTEMPTS = BACKEND_RESTART_DELAYS_MS.length;

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

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

let mainWindow = null;
let backendProcess = null;
let backendPort = null;
let backendStartupLogs = [];
let backendStartPromise = null;
let backendRecoveryPromise = null;
let runtimeConfig = {
  runtimeTarget: 'desktop',
  apiBaseUrl: null,
  backendStartupError: null,
  backendStatus: createBackendStatus(),
};
let ipcHandlersRegistered = false;

function getRepoRoot() {
  return path.resolve(__dirname, '..');
}

function getRendererDistPath() {
  return path.resolve(__dirname, '..', 'flight-delay-prediction-form', 'build');
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

function getBundledBackendExecutablePath() {
  return path.join(process.resourcesPath, 'backend', BACKEND_EXECUTABLE);
}

function getBackendSpawnCommand(port) {
  if (app.isPackaged) {
    return {
      command: getBundledBackendExecutablePath(),
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

function getBackendBaseUrl() {
  return backendPort === null ? null : `http://127.0.0.1:${backendPort}`;
}

function getErrorMessage(error, fallback = 'Unknown desktop runtime failure.') {
  return error instanceof Error && error.message ? error.message : fallback;
}

function pushBackendLog(chunk) {
  const text = String(chunk).trim();
  if (!text) {
    return;
  }

  backendStartupLogs.push(text);
  backendStartupLogs = backendStartupLogs.slice(-20);
}

function formatBackendLogTail() {
  return backendStartupLogs.length > 0
    ? ` Backend logs: ${backendStartupLogs.join(' | ')}`
    : '';
}

function deriveStartupError(status) {
  if (!status) {
    return null;
  }

  if (status.state === 'failed' && !status.hasEverBeenHealthy) {
    return status.lastError;
  }

  return null;
}

function getBackendStatusSnapshot() {
  return { ...runtimeConfig.backendStatus };
}

function setBackendStatus(nextStatus) {
  runtimeConfig = {
    runtimeTarget: 'desktop',
    apiBaseUrl: nextStatus.apiBaseUrl,
    backendStartupError: deriveStartupError(nextStatus),
    backendStatus: nextStatus,
  };

  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(BACKEND_STATUS_CHANNEL, getBackendStatusSnapshot());
}

async function ensureBackendPortConfigured() {
  if (backendPort !== null) {
    return getBackendBaseUrl();
  }

  backendPort = await findFreePort();
  const baseUrl = getBackendBaseUrl();
  setBackendStatus(createBackendStatus({
    state: 'starting',
    apiBaseUrl: baseUrl,
    lastError: null,
    isRestarting: false,
    hasEverBeenHealthy: false,
  }));
  return baseUrl;
}

async function waitForBackendHealth(baseUrl, processRef, getLaunchError, timeoutMs = 45000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const launchError = getLaunchError();
    if (launchError) {
      throw launchError;
    }

    if (processRef.exitCode !== null) {
      break;
    }

    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) {
        const payload = await response.json();
        if (!payload.modelLoaded) {
          throw new Error('Bundled backend started without a trained model artifact.');
        }
        return payload;
      }
    } catch (error) {
      void error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const launchError = getLaunchError();
  if (launchError) {
    throw launchError;
  }

  throw new Error(`The local prediction service did not become healthy in time.${formatBackendLogTail()}`);
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

function buildEarlyExitError(code, signal) {
  return new Error(
    `The local prediction service exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'null'}).${formatBackendLogTail()}`,
  );
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }

  return focusWindow(mainWindow);
}

async function launchBackendAttempt() {
  const baseUrl = await ensureBackendPortConfigured();
  const { command, args, cwd } = getBackendSpawnCommand(backendPort);

  backendStartupLogs = [];

  let launchError = null;
  let becameHealthy = false;
  const processRef = spawn(command, args, {
    cwd,
    env: {
      ...process.env,
      FLIGHT_DELAY_ENV: 'production',
      FLIGHT_DELAY_ALLOW_HEURISTIC_FALLBACK: 'false',
      PYTHONUNBUFFERED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProcess = processRef;
  processRef.stdout?.on('data', (chunk) => {
    pushBackendLog(chunk);
    process.stdout.write(`[backend] ${chunk}`);
  });
  processRef.stderr?.on('data', (chunk) => {
    pushBackendLog(chunk);
    process.stderr.write(`[backend] ${chunk}`);
  });
  processRef.once('error', (error) => {
    launchError = new Error(`Unable to launch the local prediction service: ${error.message}`);
  });

  processRef.once('exit', (code, signal) => {
    if (backendProcess === processRef) {
      backendProcess = null;
    }

    const exitError = buildEarlyExitError(code, signal);
    if (!becameHealthy) {
      launchError = exitError;
      return;
    }

    if (!app.isQuitting) {
      console.error(exitError.message);
      void recoverBackendAfterUnexpectedExit(exitError.message);
    }
  });

  await waitForBackendHealth(baseUrl, processRef, () => launchError);
  becameHealthy = true;
}

async function startBackendFlow(mode) {
  if (backendStartPromise) {
    return backendStartPromise;
  }

  const baseUrl = await ensureBackendPortConfigured();
  const hasEverBeenHealthy = runtimeConfig.backendStatus.hasEverBeenHealthy;
  setBackendStatus(createBackendStatus({
    state: mode === 'startup' && !hasEverBeenHealthy ? 'starting' : 'restarting',
    apiBaseUrl: baseUrl,
    lastError: mode === 'startup' ? null : runtimeConfig.backendStatus.lastError,
    isRestarting: mode !== 'startup' || hasEverBeenHealthy,
    hasEverBeenHealthy,
  }));

  backendStartPromise = launchBackendAttempt()
    .then(() => {
      setBackendStatus(createBackendStatus({
        state: 'healthy',
        apiBaseUrl: getBackendBaseUrl(),
        lastError: null,
        isRestarting: false,
        hasEverBeenHealthy: true,
      }));
      return getBackendStatusSnapshot();
    })
    .finally(() => {
      backendStartPromise = null;
    });

  return backendStartPromise;
}

async function recoverBackendAfterUnexpectedExit(initialErrorMessage) {
  if (backendRecoveryPromise) {
    return backendRecoveryPromise;
  }

  backendRecoveryPromise = (async () => {
    let lastError = initialErrorMessage;

    for (let attempt = 0; attempt < MAX_BACKEND_RESTART_ATTEMPTS; attempt += 1) {
      const recoveryStatus = getRecoveryStatus({
        attempt,
        maxAttempts: MAX_BACKEND_RESTART_ATTEMPTS,
        apiBaseUrl: getBackendBaseUrl(),
        lastError,
        hasEverBeenHealthy: true,
      });
      setBackendStatus(recoveryStatus);

      const delayMs = getRestartDelayMs(attempt);
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      try {
        await startBackendFlow('restart');
        return getBackendStatusSnapshot();
      } catch (error) {
        lastError = getErrorMessage(error);
      }
    }

    setBackendStatus(createBackendStatus({
      state: 'failed',
      apiBaseUrl: getBackendBaseUrl(),
      lastError,
      isRestarting: false,
      hasEverBeenHealthy: true,
    }));

    throw new Error(lastError);
  })().finally(() => {
    backendRecoveryPromise = null;
  });

  return backendRecoveryPromise;
}

async function ensureBackendReady() {
  if (!getBackendBaseUrl()) {
    throw new Error(runtimeConfig.backendStartupError ?? 'The packaged local prediction service is not configured.');
  }

  if (runtimeConfig.backendStatus.state === 'healthy' && backendProcess && backendProcess.exitCode === null) {
    return getBackendStatusSnapshot();
  }

  try {
    if (backendRecoveryPromise) {
      await backendRecoveryPromise;
    } else if (backendStartPromise) {
      await backendStartPromise;
    } else {
      await startBackendFlow(runtimeConfig.backendStatus.hasEverBeenHealthy ? 'restart' : 'startup');
    }
  } catch (error) {
    const message = getErrorMessage(error);
    setBackendStatus(createBackendStatus({
      state: 'failed',
      apiBaseUrl: getBackendBaseUrl(),
      lastError: message,
      isRestarting: false,
      hasEverBeenHealthy: runtimeConfig.backendStatus.hasEverBeenHealthy,
    }));
    throw new Error(message);
  }

  const snapshot = getBackendStatusSnapshot();
  if (snapshot.state !== 'healthy') {
    throw new Error(snapshot.lastError ?? 'The local prediction service is unavailable.');
  }

  return snapshot;
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

function registerIpcHandlers() {
  if (ipcHandlersRegistered) {
    return;
  }

  ipcMain.handle(BACKEND_ENSURE_READY_CHANNEL, async () => ensureBackendReady());
  ipcHandlersRegistered = true;
}

async function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    focusMainWindow();
    return mainWindow;
  }

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
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send(BACKEND_STATUS_CHANNEL, getBackendStatusSnapshot());
  });

  await mainWindow.loadURL(INDEX_URL);
  return mainWindow;
}

async function showExistingWindowOrCreate() {
  if (focusMainWindow()) {
    return;
  }

  await createMainWindow();
}

async function bootstrapDesktopApp() {
  try {
    ensureRendererBuildExists();
    registerAppProtocol();
    registerIpcHandlers();

    try {
      await ensureBackendPortConfigured();
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to allocate the local prediction service port.');
      setBackendStatus(createBackendStatus({
        state: 'failed',
        apiBaseUrl: null,
        lastError: message,
        isRestarting: false,
        hasEverBeenHealthy: false,
      }));
    }

    await createMainWindow();

    if (getBackendBaseUrl()) {
      void startBackendFlow('startup').catch((error) => {
        const message = getErrorMessage(error);
        setBackendStatus(createBackendStatus({
          state: 'failed',
          apiBaseUrl: getBackendBaseUrl(),
          lastError: message,
          isRestarting: false,
          hasEverBeenHealthy: runtimeConfig.backendStatus.hasEverBeenHealthy,
        }));
      });
    }
  } catch (error) {
    const message = getErrorMessage(error);
    console.error(message);
    await stopBackendProcess();
    app.exit(1);
  }
}

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('second-instance', () => {
  void showExistingWindowOrCreate();
});

app.whenReady().then(bootstrapDesktopApp);

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    await stopBackendProcess();
    app.quit();
  }
});

app.on('activate', async () => {
  await showExistingWindowOrCreate();
});

app.on('will-quit', async (event) => {
  if (backendProcess && backendProcess.exitCode === null) {
    event.preventDefault();
    await stopBackendProcess();
    app.quit();
  }
});
