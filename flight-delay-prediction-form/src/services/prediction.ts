import { createApiClient } from '@/lib/api';
import { normalizeAirportCode } from '@/lib/airports';
import type {
  FlightFormData,
  ItineraryPredictionSummary,
  LegPrediction,
  PredictionRequest,
  PredictionResponse,
  RouteValidationIssue,
  RiskLevel,
} from '@/types';

const apiClient = createApiClient();
const shouldIncludeDebug = import.meta.env.DEV;

const HIGH_TRAFFIC_AIRPORTS = new Set(['ATL', 'LAX', 'ORD', 'DFW', 'DEN', 'JFK', 'SFO', 'SEA', 'MCO', 'LAS']);
const MEDIUM_TRAFFIC_AIRPORTS = new Set(['BOS', 'CLT', 'EWR', 'IAH', 'MIA', 'PHX', 'MSP', 'DTW', 'PHL', 'BWI']);

const MIN_TEMPERATURE = -50;
const MAX_TEMPERATURE = 130;

/* =========================
   Helpers
========================= */

function sanitizeTemperature(temp: string): string {
  const value = parseInt(temp || '', 10);

  if (Number.isNaN(value)) return '';

  const clamped = Math.min(MAX_TEMPERATURE, Math.max(MIN_TEMPERATURE, value));
  return String(clamped);
}

/* =========================
   Core API Prep
========================= */

export function preparePredictionRequest(data: FlightFormData) {
  return {
    request: {
      departureDate: data.departureDate,
      departureTime: data.departureTime,
      originAirport: normalizeAirportCode(data.originAirport),
      destinationAirport: normalizeAirportCode(data.destinationAirport),
      duration: data.duration,
      temperature: sanitizeTemperature(data.temperature),
      precipitation: data.precipitation,
      wind: data.wind,
      includeDebug: shouldIncludeDebug,
    },
    normalizedConnections: data.connections.map(normalizeAirportCode),
  };
}

/* =========================
   Validation
========================= */

export function validateRoute(data: FlightFormData): RouteValidationIssue[] {
  const { request, normalizedConnections } = preparePredictionRequest(data);
  const issues: RouteValidationIssue[] = [];

  const temp = parseInt(data.temperature || '', 10);

  if (data.temperature !== '' && Number.isNaN(temp)) {
    issues.push({
      code: 'invalid_temperature',
      field: 'temperature',
      message: 'Temperature must be a valid number.',
    });
  } else if (!Number.isNaN(temp) && (temp < MIN_TEMPERATURE || temp > MAX_TEMPERATURE)) {
    issues.push({
      code: 'temperature_out_of_range',
      field: 'temperature',
      message: `Temperature must be between ${MIN_TEMPERATURE}°F and ${MAX_TEMPERATURE}°F.`,
    });
  }

  const normalizedOrigin = request.originAirport;
  const normalizedDestination = request.destinationAirport;

  if (
    normalizedOrigin &&
    normalizedDestination &&
    normalizedConnections.length === 0 &&
    normalizedOrigin === normalizedDestination
  ) {
    issues.push({
      code: 'same_origin_destination',
      field: 'destinationAirport',
      stopIndex: 1,
      message: 'Origin and destination cannot be the same airport for a direct flight.',
    });
  }

  return issues;
}

/* =========================
   PUBLIC ENTRYPOINT (RESTORED)
========================= */

export async function submitPrediction(
  data: FlightFormData
): Promise<PredictionResponse> {
  const { request } = preparePredictionRequest(data);

  // If API not configured → fallback
  if (!apiClient.baseUrl) {
    console.info('API base URL not configured. Using mock prediction.');
    return generateMockPrediction(request);
  }

  try {
    const response = await apiClient.post<PredictionRequest, PredictionResponse>(
      '/predict',
      request
    );

    return response;
  } catch (error) {
    console.warn('Prediction API failed, using mock fallback.', error);
    return generateMockPrediction(request);
  }
}

/* =========================
   Mock Prediction
========================= */

export function generateMockPrediction(
  data: PredictionRequest
): PredictionResponse {
  return {
    probability: 50,
    riskLevel: 'moderate',
    explanation: 'Mock prediction (API unavailable).',
    source: 'mock_fallback',
    submittedRequest: data,
  };
}
