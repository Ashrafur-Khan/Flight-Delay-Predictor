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

interface PreparedFlightData {
  request: PredictionRequest;
  normalizedConnections: string[];
}

export function preparePredictionRequest(data: FlightFormData): PreparedFlightData {
  return {
    request: {
      departureDate: data.departureDate,
      departureTime: data.departureTime,
      originAirport: normalizeAirportCode(data.originAirport),
      destinationAirport: normalizeAirportCode(data.destinationAirport),
      duration: data.duration,
      temperature: data.temperature,
      precipitation: data.precipitation,
      wind: data.wind,
      includeDebug: shouldIncludeDebug,
    },
    normalizedConnections: data.connections.map(normalizeAirportCode),
  };
}

export function validateRoute(data: FlightFormData): RouteValidationIssue[] {
  const { request, normalizedConnections } = preparePredictionRequest(data);
  const issues: RouteValidationIssue[] = [];

  const origin = request.originAirport;
  const destination = request.destinationAirport;
  const layovers = normalizedConnections.filter(Boolean);

  const route = [origin, ...layovers, destination].filter(Boolean);

  // 1. Direct same airport
  if (route.length === 2 && origin === destination) {
    issues.push({
      code: 'same_origin_destination',
      field: 'destinationAirport',
      stopIndex: 1,
      message: 'Origin and destination cannot be the same airport for a direct flight.',
    });
  }

  // 2. All same airport
  if (route.length > 1 && new Set(route).size === 1) {
    issues.push({
      code: 'all_same_airport',
      field: 'destinationAirport',
      stopIndex: route.length - 1,
      message: 'Origin, layovers, and destination cannot all be the same airport.',
    });
  }

  // 3. Consecutive duplicates
  for (let i = 0; i < route.length - 1; i++) {
    if (route[i] === route[i + 1]) {
      issues.push({
        code: 'duplicate_consecutive_stop',
        field: i === route.length - 2 ? 'destinationAirport' : 'connections',
        stopIndex: i + 1,
        message: `Invalid segment: ${route[i]} → ${route[i + 1]}. Enter a different airport.`,
      });
    }
  }

  // 4. Loop detection
  const visited = new Set<string>();
  route.forEach((airport, index) => {
    if (visited.has(airport)) {
      issues.push({
        code: 'loop_detected',
        field: index === route.length - 1 ? 'destinationAirport' : 'connections',
        stopIndex: index,
        message: 'Itinerary cannot revisit the same airport. Remove duplicate stops.',
      });
    }
    visited.add(airport);
  });

  // 5. Return to origin with layovers
  if (layovers.length > 0 && origin === destination) {
    issues.push({
      code: 'returns_to_origin',
      field: 'destinationAirport',
      stopIndex: route.length - 1,
      message: 'Layover route cannot return to the origin airport. Choose a different destination.',
    });
  }

  return issues;
}

export async function submitPrediction(data: FlightFormData): Promise<PredictionResponse> {
  const { request, normalizedConnections } = preparePredictionRequest(data);
  const itinerarySummary = buildItinerarySummary(request, normalizedConnections);

  if (!apiClient.baseUrl) {
    return finalizePrediction(generateMockPrediction(request), itinerarySummary);
  }

  try {
    const response = await apiClient.post<PredictionRequest, PredictionResponse>('/predict', request);
    return finalizePrediction({
      ...response,
      source: 'backend',
      submittedRequest: request,
    }, itinerarySummary);
  } catch {
    return finalizePrediction(generateMockPrediction(request), itinerarySummary);
  }
}

/* ===========================
   MOCK + HEURISTIC SCORING
=========================== */

export function generateMockPrediction(data: PredictionRequest): PredictionResponse {
  const { probability, riskLevel, factors } = computeLegScore(data, data.originAirport, data.destinationAirport);

  const explanation = factors.length
    ? `Based on the flight details, there's a ${riskLevel} delay risk due to ${factors.join(', ')}.`
    : 'Conditions appear stable for this flight.';

  return {
    probability,
    riskLevel,
    explanation,
    source: 'mock_fallback',
    submittedRequest: data,
  };
}

const resolveRisk = (p: number): RiskLevel => (p < 30 ? 'low' : p < 70 ? 'moderate' : 'high');

const clamp = (v: number) => Math.min(95, Math.max(5, v));

const getDepartureHour = (time: string) => parseInt(time.split(':')[0] || '0', 10);

const getTrafficWeight = (airport: string) => {
  if (HIGH_TRAFFIC_AIRPORTS.has(airport)) return 8;
  if (MEDIUM_TRAFFIC_AIRPORTS.has(airport)) return 4;
  return 2;
};

const computeLegScore = (
  data: PredictionRequest,
  origin: string,
  destination: string,
  penalty = 0,
) => {
  let p = 25;
  const factors: string[] = [];

  if (data.precipitation === 'snow') { p += 35; factors.push('snow'); }
  if (data.precipitation === 'thunderstorms') { p += 30; factors.push('storms'); }
  if (data.precipitation === 'rain') { p += 15; factors.push('rain'); }

  if (data.wind === 'strong') { p += 20; factors.push('strong winds'); }
  if (data.wind === 'moderate') { p += 10; factors.push('moderate winds'); }

  const hour = getDepartureHour(data.departureTime);
  if (hour >= 6 && hour <= 9) { p += 12; factors.push('morning rush'); }
  if (hour >= 17 && hour <= 20) { p += 15; factors.push('evening peak'); }

  const duration = parseInt(data.duration || '0', 10);
  if (duration > 300) { p += 8; factors.push('long haul'); }

  p += getTrafficWeight(origin) + getTrafficWeight(destination);

  p = clamp(p + penalty);

  return { probability: p, riskLevel: resolveRisk(p), factors };
};

/* ===========================
   ITINERARY (FRONTEND TEMP)
=========================== */

const buildItinerarySummary = (
  request: PredictionRequest,
  connections: string[],
): ItineraryPredictionSummary | undefined => {
  const stops = [request.originAirport, ...connections, request.destinationAirport];

  if (connections.length === 0) return undefined;

  const legs = stops.slice(0, -1).map((from, i) => ({
    from,
    to: stops[i + 1],
  }));

  const legPredictions: LegPrediction[] = legs.map((leg, i) => {
    const penalty = i < legs.length - 1 ? 6 : 3;
    const scored = computeLegScore(request, leg.from, leg.to, penalty);

    return {
      from: leg.from,
      to: leg.to,
      probability: scored.probability,
      riskLevel: scored.riskLevel,
      explanation: `This leg shows ${scored.riskLevel} delay risk.`,
    };
  });

  const probs = legPredictions.map(l => l.probability);
  const aggregate = clamp(Math.round(probs.reduce((a, b) => a + b, 0) / probs.length));

  return {
    legs: legPredictions,
    aggregateProbability: aggregate,
    aggregateRiskLevel: resolveRisk(aggregate),
    aggregateExplanation: `This itinerary has an estimated ${aggregate}% delay risk.`,
  };
};

const finalizePrediction = (
  prediction: PredictionResponse,
  itinerary?: ItineraryPredictionSummary,
): PredictionResponse => {
  if (!itinerary) return prediction;

  return {
    ...prediction,
    baseProbability: prediction.probability,
    probability: itinerary.aggregateProbability,
    riskLevel: itinerary.aggregateRiskLevel,
    explanation: itinerary.aggregateExplanation,
    itinerarySummary: itinerary,
  };
};
