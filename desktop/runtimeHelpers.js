const BACKEND_RESTART_DELAYS_MS = [0, 1000, 2500];

function focusWindow(windowRef) {
  if (!windowRef) {
    return false;
  }

  if (typeof windowRef.isMinimized === 'function' && windowRef.isMinimized()) {
    windowRef.restore();
  }

  if (typeof windowRef.isVisible === 'function') {
    if (!windowRef.isVisible() && typeof windowRef.show === 'function') {
      windowRef.show();
    }
  } else if (typeof windowRef.show === 'function') {
    windowRef.show();
  }

  if (typeof windowRef.focus === 'function') {
    windowRef.focus();
  }

  return true;
}

function createBackendStatus({
  state = 'starting',
  apiBaseUrl = null,
  lastError = null,
  isRestarting = state === 'restarting',
  hasEverBeenHealthy = false,
} = {}) {
  return {
    state,
    apiBaseUrl,
    lastError,
    isRestarting,
    hasEverBeenHealthy,
  };
}

function getRestartDelayMs(attempt) {
  return BACKEND_RESTART_DELAYS_MS[Math.min(attempt, BACKEND_RESTART_DELAYS_MS.length - 1)] ?? 0;
}

function getRecoveryStatus({ attempt, maxAttempts, apiBaseUrl, lastError, hasEverBeenHealthy }) {
  if (attempt < maxAttempts) {
    return createBackendStatus({
      state: 'restarting',
      apiBaseUrl,
      lastError,
      isRestarting: true,
      hasEverBeenHealthy,
    });
  }

  return createBackendStatus({
    state: 'failed',
    apiBaseUrl,
    lastError,
    isRestarting: false,
    hasEverBeenHealthy,
  });
}

module.exports = {
  BACKEND_RESTART_DELAYS_MS,
  createBackendStatus,
  focusWindow,
  getRecoveryStatus,
  getRestartDelayMs,
};
