import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FlightFormData } from '../src/types';

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

const setDesktopRuntime = (config: { apiBaseUrl: string | null; backendStartupError: string | null }) => {
  Object.defineProperty(globalThis, 'window', {
    value: {
      flightDelayDesktop: {
        runtimeTarget: 'desktop',
        apiBaseUrl: config.apiBaseUrl,
        backendStartupError: config.backendStartupError,
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
  it('renders a fatal startup state when Electron reports a backend startup error', async () => {
    setDesktopRuntime({
      apiBaseUrl: null,
      backendStartupError: 'Bundled backend failed to start.',
    });

    const { default: App } = await import('../src/App');
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('Desktop Startup Issue');
    expect(markup).toContain('Bundled backend failed to start.');
  });

  it('does not fall back to a mock prediction when the packaged backend is missing', async () => {
    setDesktopRuntime({
      apiBaseUrl: null,
      backendStartupError: 'Bundled backend failed to start.',
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
