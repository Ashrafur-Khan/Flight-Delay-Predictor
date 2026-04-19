import { afterEach, describe, expect, it, vi } from 'vitest';
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

const setWindowLocation = (href: string) => {
  Object.defineProperty(globalThis, 'window', {
    value: {
      location: new URL(href),
    },
    configurable: true,
    writable: true,
  });
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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

describe('portable runtime integration', () => {
  it('uses the same-origin backend when the app is served from /app/', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    setWindowLocation('http://127.0.0.1:8000/app/');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        probability: 47,
        riskLevel: 'moderate',
        explanation: 'Portable backend response.',
      }),
    } as Response) as typeof fetch;

    const { submitPrediction } = await import('../src/services/prediction');
    const response = await submitPrediction(buildFormData());

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/predict',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(response.source).toBe('backend');
    expect(response.explanation).toBe('Portable backend response.');
  });

  it('keeps the web fallback behavior outside the portable /app/ route', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    setWindowLocation('http://127.0.0.1:3000/');
    globalThis.fetch = vi.fn() as typeof fetch;

    const { submitPrediction } = await import('../src/services/prediction');
    const response = await submitPrediction(buildFormData());

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(response.source).toBe('mock_fallback');
  });
});
