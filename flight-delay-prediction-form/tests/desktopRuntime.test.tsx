import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FlightFormData } from '../src/types';

const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;

type DesktopStatusState = 'starting' | 'healthy' | 'restarting' | 'failed';

interface MockDesktopStatus {
  state: DesktopStatusState;
  apiBaseUrl: string | null;
  lastError: string | null;
  isRestarting: boolean;
  hasEverBeenHealthy: boolean;
}

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

const defaultStatus = (overrides: Partial<MockDesktopStatus> = {}): MockDesktopStatus => ({
  state: 'healthy',
  apiBaseUrl: 'http://127.0.0.1:45555',
  lastError: null,
  isRestarting: false,
  hasEverBeenHealthy: true,
  ...overrides,
});

const setDesktopRuntime = ({
  apiBaseUrl,
  backendStartupError,
  backendStatus,
  ensureBackendReady,
}: {
  apiBaseUrl?: string | null;
  backendStartupError?: string | null;
  backendStatus: MockDesktopStatus;
  ensureBackendReady?: () => Promise<MockDesktopStatus>;
}) => {
  let currentStatus = backendStatus;
  let statusListener: ((status: MockDesktopStatus) => void) | null = null;

  Object.defineProperty(globalThis, 'window', {
    value: {
      flightDelayDesktop: {
        runtimeTarget: 'desktop',
        get apiBaseUrl() {
          return apiBaseUrl ?? currentStatus.apiBaseUrl;
        },
        get backendStartupError() {
          return backendStartupError ?? (
            currentStatus.state === 'failed' && !currentStatus.hasEverBeenHealthy
              ? currentStatus.lastError
              : null
          );
        },
        get backendStatus() {
          return currentStatus;
        },
        getBackendStatus: () => currentStatus,
        subscribeBackendStatus: (callback: (status: MockDesktopStatus) => void) => {
          statusListener = callback;
          return () => {
            statusListener = null;
          };
        },
        ensureBackendReady: ensureBackendReady ?? vi.fn().mockResolvedValue(currentStatus),
      },
    },
    configurable: true,
    writable: true,
  });

  return {
    setStatus(nextStatus: MockDesktopStatus) {
      currentStatus = nextStatus;
      statusListener?.(currentStatus);
    },
  };
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
      backendStatus: defaultStatus({
        state: 'failed',
        apiBaseUrl: null,
        lastError: 'Bundled backend failed to start.',
        hasEverBeenHealthy: false,
      }),
    });

    const { default: App } = await import('../src/App');
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('Desktop Startup Issue');
    expect(markup).toContain('Bundled backend failed to start.');
  });

  it('does not show the fatal startup screen after a previously healthy backend fails', async () => {
    setDesktopRuntime({
      backendStatus: defaultStatus({
        state: 'failed',
        lastError: 'Backend exited unexpectedly.',
        hasEverBeenHealthy: true,
      }),
    });

    const { default: App } = await import('../src/App');
    const markup = renderToStaticMarkup(<App />);

    expect(markup).not.toContain('Desktop Startup Issue');
    expect(markup).toContain('Flight Delay Predictor');
  });

  it('does not fall back to a mock prediction when the packaged backend is missing', async () => {
    setDesktopRuntime({
      apiBaseUrl: null,
      backendStartupError: 'Bundled backend failed to start.',
      backendStatus: defaultStatus({
        state: 'failed',
        apiBaseUrl: null,
        lastError: 'Bundled backend failed to start.',
        hasEverBeenHealthy: false,
      }),
      ensureBackendReady: vi.fn().mockRejectedValue(new Error('Bundled backend failed to start.')),
    });

    const { submitPrediction } = await import('../src/services/prediction');

    await expect(submitPrediction(buildFormData())).rejects.toThrow('Bundled backend failed to start.');
  });

  it('waits for the desktop backend bridge before posting a prediction request', async () => {
    const ensureBackendReady = vi.fn().mockResolvedValue(defaultStatus());
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        probability: 42,
        riskLevel: 'moderate',
        explanation: 'Recovered backend response.',
      }),
    });

    setDesktopRuntime({
      backendStatus: defaultStatus(),
      ensureBackendReady,
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const { submitPrediction } = await import('../src/services/prediction');
    const result = await submitPrediction(buildFormData());

    expect(ensureBackendReady).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.source).toBe('backend');
  });

  it('reads updated backend status snapshots from the desktop bridge', async () => {
    const runtime = setDesktopRuntime({
      backendStatus: defaultStatus({
        state: 'starting',
        lastError: null,
        hasEverBeenHealthy: false,
      }),
    });

    const { getRuntimeConfig } = await import('../src/lib/runtime');

    expect(getRuntimeConfig().backendStatus?.state).toBe('starting');

    runtime.setStatus(defaultStatus({
      state: 'restarting',
      lastError: 'Backend exited unexpectedly.',
      isRestarting: true,
    }));

    expect(getRuntimeConfig().backendStatus?.state).toBe('restarting');
    expect(getRuntimeConfig().backendStatus?.lastError).toBe('Backend exited unexpectedly.');
  });

  it('returns a stable runtime snapshot when desktop state has not changed', async () => {
    setDesktopRuntime({
      backendStatus: defaultStatus({
        state: 'starting',
        lastError: null,
        hasEverBeenHealthy: false,
      }),
    });

    const { getRuntimeConfig } = await import('../src/lib/runtime');
    const firstSnapshot = getRuntimeConfig();
    const secondSnapshot = getRuntimeConfig();

    expect(secondSnapshot).toBe(firstSnapshot);
  });

  it('surfaces desktop backend request failures instead of returning a mock result', async () => {
    setDesktopRuntime({
      backendStatus: defaultStatus(),
    });
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')) as typeof fetch;

    const { submitPrediction } = await import('../src/services/prediction');

    await expect(submitPrediction(buildFormData())).rejects.toThrow('connect ECONNREFUSED');
  });
});
