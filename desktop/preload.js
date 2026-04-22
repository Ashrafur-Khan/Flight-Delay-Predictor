const { contextBridge, ipcRenderer } = require('electron');

const RUNTIME_ARG_PREFIX = '--flight-delay-runtime-config=';
const BACKEND_STATUS_CHANNEL = 'flight-delay-backend-status';
const BACKEND_ENSURE_READY_CHANNEL = 'flight-delay-backend-ensure-ready';

function readRuntimeConfig() {
  const encodedConfigArg = process.argv.find((value) => value.startsWith(RUNTIME_ARG_PREFIX));
  if (!encodedConfigArg) {
    return {
      runtimeTarget: 'desktop',
      apiBaseUrl: null,
      backendStartupError: 'Desktop runtime configuration was not provided.',
      backendStatus: {
        state: 'failed',
        apiBaseUrl: null,
        lastError: 'Desktop runtime configuration was not provided.',
        isRestarting: false,
        hasEverBeenHealthy: false,
      },
    };
  }

  try {
    const encodedPayload = encodedConfigArg.slice(RUNTIME_ARG_PREFIX.length);
    const payload = Buffer.from(encodedPayload, 'base64').toString('utf8');
    const parsed = JSON.parse(payload);
    const backendStatus = parsed.backendStatus ?? {};

    return {
      runtimeTarget: 'desktop',
      apiBaseUrl: typeof parsed.apiBaseUrl === 'string' ? parsed.apiBaseUrl : null,
      backendStartupError: typeof parsed.backendStartupError === 'string' ? parsed.backendStartupError : null,
      backendStatus: {
        state: typeof backendStatus.state === 'string' ? backendStatus.state : 'starting',
        apiBaseUrl: typeof backendStatus.apiBaseUrl === 'string' ? backendStatus.apiBaseUrl : null,
        lastError: typeof backendStatus.lastError === 'string' ? backendStatus.lastError : null,
        isRestarting: Boolean(backendStatus.isRestarting),
        hasEverBeenHealthy: Boolean(backendStatus.hasEverBeenHealthy),
      },
    };
  } catch (error) {
    void error;
    return {
      runtimeTarget: 'desktop',
      apiBaseUrl: null,
      backendStartupError: 'Desktop runtime configuration could not be parsed.',
      backendStatus: {
        state: 'failed',
        apiBaseUrl: null,
        lastError: 'Desktop runtime configuration could not be parsed.',
        isRestarting: false,
        hasEverBeenHealthy: false,
      },
    };
  }
}

const runtimeState = readRuntimeConfig();
const listeners = new Set();

ipcRenderer.on(BACKEND_STATUS_CHANNEL, (_event, status) => {
  runtimeState.backendStatus = {
    state: typeof status?.state === 'string' ? status.state : runtimeState.backendStatus.state,
    apiBaseUrl: typeof status?.apiBaseUrl === 'string' ? status.apiBaseUrl : null,
    lastError: typeof status?.lastError === 'string' ? status.lastError : null,
    isRestarting: Boolean(status?.isRestarting),
    hasEverBeenHealthy: Boolean(status?.hasEverBeenHealthy),
  };
  runtimeState.apiBaseUrl = runtimeState.backendStatus.apiBaseUrl;
  runtimeState.backendStartupError = (
    runtimeState.backendStatus.state === 'failed' && !runtimeState.backendStatus.hasEverBeenHealthy
  )
    ? runtimeState.backendStatus.lastError
    : null;

  listeners.forEach((listener) => listener({ ...runtimeState.backendStatus }));
});

contextBridge.exposeInMainWorld('flightDelayDesktop', Object.freeze({
  runtimeTarget: 'desktop',
  get apiBaseUrl() {
    return runtimeState.apiBaseUrl;
  },
  get backendStartupError() {
    return runtimeState.backendStartupError;
  },
  get backendStatus() {
    return { ...runtimeState.backendStatus };
  },
  getBackendStatus() {
    return { ...runtimeState.backendStatus };
  },
  subscribeBackendStatus(callback) {
    if (typeof callback !== 'function') {
      return () => {};
    }

    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  },
  ensureBackendReady() {
    return ipcRenderer.invoke(BACKEND_ENSURE_READY_CHANNEL);
  },
}));
