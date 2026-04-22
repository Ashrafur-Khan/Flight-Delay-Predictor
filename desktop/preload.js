const { contextBridge } = require('electron');

const RUNTIME_ARG_PREFIX = '--flight-delay-runtime-config=';

function normalizeStartupDetails(details) {
  if (!details || typeof details !== 'object') {
    return null;
  }

  return {
    code: typeof details.code === 'string' ? details.code : 'unknown',
    title: typeof details.title === 'string' ? details.title : 'The local prediction service did not start.',
    message: typeof details.message === 'string' ? details.message : 'The local prediction service did not start.',
    technicalSummary: typeof details.technicalSummary === 'string' ? details.technicalSummary : null,
    backendExecutablePath: typeof details.backendExecutablePath === 'string' ? details.backendExecutablePath : null,
    logPath: typeof details.logPath === 'string' ? details.logPath : null,
    exitCode: typeof details.exitCode === 'number' ? details.exitCode : null,
    signal: typeof details.signal === 'string' ? details.signal : null,
  };
}

function readRuntimeConfig() {
  const encodedConfigArg = process.argv.find((value) => value.startsWith(RUNTIME_ARG_PREFIX));
  if (!encodedConfigArg) {
    return {
      runtimeTarget: 'desktop',
      apiBaseUrl: null,
      backendStartupError: 'Desktop runtime configuration was not provided.',
      backendStartup: {
        code: 'runtime_config_missing',
        title: 'The local prediction service did not start.',
        message: 'Desktop runtime configuration was not provided.',
        technicalSummary: 'The Electron preload bridge could not find the runtime configuration argument.',
        backendExecutablePath: null,
        logPath: null,
        exitCode: null,
        signal: null,
      },
    };
  }

  try {
    const encodedPayload = encodedConfigArg.slice(RUNTIME_ARG_PREFIX.length);
    const payload = Buffer.from(encodedPayload, 'base64').toString('utf8');
    const parsed = JSON.parse(payload);
    const backendStartup = normalizeStartupDetails(parsed.backendStartup);
    const backendStartupError = typeof parsed.backendStartupError === 'string'
      ? parsed.backendStartupError
      : backendStartup?.message ?? null;

    return {
      runtimeTarget: 'desktop',
      apiBaseUrl: typeof parsed.apiBaseUrl === 'string' ? parsed.apiBaseUrl : null,
      backendStartupError,
      backendStartup,
    };
  } catch (error) {
    void error;
    return {
      runtimeTarget: 'desktop',
      apiBaseUrl: null,
      backendStartupError: 'Desktop runtime configuration could not be parsed.',
      backendStartup: {
        code: 'runtime_config_invalid',
        title: 'The local prediction service did not start.',
        message: 'Desktop runtime configuration could not be parsed.',
        technicalSummary: 'The Electron preload bridge could not parse the runtime configuration payload.',
        backendExecutablePath: null,
        logPath: null,
        exitCode: null,
        signal: null,
      },
    };
  }
}

contextBridge.exposeInMainWorld('flightDelayDesktop', Object.freeze(readRuntimeConfig()));
