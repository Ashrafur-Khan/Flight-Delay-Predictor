const { contextBridge } = require('electron');

const RUNTIME_ARG_PREFIX = '--flight-delay-runtime-config=';

function readRuntimeConfig() {
  const encodedConfigArg = process.argv.find((value) => value.startsWith(RUNTIME_ARG_PREFIX));
  if (!encodedConfigArg) {
    return {
      runtimeTarget: 'desktop',
      apiBaseUrl: null,
      backendStartupError: 'Desktop runtime configuration was not provided.',
    };
  }

  try {
    const encodedPayload = encodedConfigArg.slice(RUNTIME_ARG_PREFIX.length);
    const payload = Buffer.from(encodedPayload, 'base64').toString('utf8');
    const parsed = JSON.parse(payload);

    return {
      runtimeTarget: 'desktop',
      apiBaseUrl: typeof parsed.apiBaseUrl === 'string' ? parsed.apiBaseUrl : null,
      backendStartupError: typeof parsed.backendStartupError === 'string' ? parsed.backendStartupError : null,
    };
  } catch (error) {
    void error;
    return {
      runtimeTarget: 'desktop',
      apiBaseUrl: null,
      backendStartupError: 'Desktop runtime configuration could not be parsed.',
    };
  }
}

contextBridge.exposeInMainWorld('flightDelayDesktop', Object.freeze(readRuntimeConfig()));
