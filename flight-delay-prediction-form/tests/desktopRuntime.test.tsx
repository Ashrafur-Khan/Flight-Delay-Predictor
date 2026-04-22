import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FlightFormData } from '../src/types';
import {
  getDesktopStartupErrorMessage,
  type DesktopStartupIssue,
} from '../src/lib/runtime';

const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;

const buildFormData = (overrides: Partial<FlightFormData> = {}): FlightFormData => ({
  departureDate: '2026-05-15',
  departureTime: '08:30',
  originAirport: 'LAX',
  destinationAirport: 'JFK',
  connections: [],
  temperature: '72',
  precipitation: 'rain',
  wind: 'moderate',
  ...overrides,
});

const buildStartupIssue = (overrides: Partial<DesktopStartupIssue> = {}): DesktopStartupIssue => ({
  code: 'launch_blocked',
  title: 'The local prediction service did not start.',
  message: 'Bundled backend failed to start.',
  technicalSummary: 'codesign blocked nested backend execution.',
  backendExecutablePath: '/Applications/Flight Delay Predictor.app/Contents/Resources/backend/flight-delay-backend',
  logPath: '/Users/test/Library/Application Support/Flight Delay Predictor/logs/backend-startup.log',
  exitCode: null,
  signal: null,
  ...overrides,
});

const setDesktopRuntime = (config: {
  apiBaseUrl: string | null;
  backendStartupError: string | null;
  backendStartup?: DesktopStartupIssue | null;
}) => {
  Object.defineProperty(globalThis, 'window', {
    value: {
      flightDelayDesktop: {
        runtimeTarget: 'desktop',
        apiBaseUrl: config.apiBaseUrl,
        backendStartupError: config.backendStartupError,
        backendStartup: config.backendStartup ?? null,
      },
    },
    configurable: true,
    writable: true,
  });
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  Object.defineProperty(globalThis, 'window', {
    value: originalWindow,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'fetch', {
    value: originalFetch,
    configurable: true,
    writable: true,
  });
});

describe('desktop runtime integration', () => {
  it('maps structured startup issues to the legacy error message', () => {
    expect(getDesktopStartupErrorMessage(buildStartupIssue({
      code: 'launch_blocked',
      message: 'Launch blocked.',
    }))).toBe('Launch blocked.');
    expect(getDesktopStartupErrorMessage(buildStartupIssue({
      code: 'backend_exited_early',
      message: 'Backend exited early.',
    }))).toBe('Backend exited early.');
    expect(getDesktopStartupErrorMessage(buildStartupIssue({
      code: 'backend_unhealthy',
      message: 'Backend timed out.',
    }))).toBe('Backend timed out.');
    expect(getDesktopStartupErrorMessage(buildStartupIssue({
      code: 'model_incompatible',
      message: 'Model missing.',
    }))).toBe('Model missing.');
  });

  it('renders a fatal startup state when Electron reports a backend startup error', async () => {
    setDesktopRuntime({
      apiBaseUrl: null,
      backendStartupError: 'Bundled backend failed to start.',
      backendStartup: buildStartupIssue(),
    });

    const { default: App } = await import('../src/App');
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('Desktop Startup Issue');
    expect(markup).toContain('Bundled backend failed to start.');
    expect(markup).toContain('Technical summary');
    expect(markup).toContain('backend-startup.log');
  });

  it('does not fall back to a mock prediction when the packaged backend is missing', async () => {
    setDesktopRuntime({
      apiBaseUrl: null,
      backendStartupError: 'Bundled backend failed to start.',
      backendStartup: buildStartupIssue(),
    });

    const { submitPrediction } = await import('../src/services/prediction');

    await expect(submitPrediction(buildFormData())).rejects.toThrow('Bundled backend failed to start.');
  });

  it('surfaces desktop backend request failures instead of returning a mock result', async () => {
    setDesktopRuntime({
      apiBaseUrl: 'http://127.0.0.1:45555',
      backendStartupError: null,
    });
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')) as typeof fetch;

    const { submitPrediction } = await import('../src/services/prediction');

    await expect(submitPrediction(buildFormData())).rejects.toThrow('connect ECONNREFUSED');
  });
});
