import { createApiClient } from '@/lib/api';
import { normalizeAirportCode } from '@/lib/airports';
import type {
  FlightFormData,
  ItineraryPredictionSummary,
  LegPrediction,
  PredictionRequest,
  PredictionResponse,
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

export async function submitPrediction(data: FlightFormData): Promise<PredictionResponse> {
  const { request, normalizedConnections } = preparePredictionRequest(data);
  const itinerarySummary = buildItinerarySummary(request, normalizedConnections);

  if (!apiClient.baseUrl) {
    console.info('API base URL not configured. Falling back to mock prediction.');
    return finalizePrediction(generateMockPrediction(request), itinerarySummary);
  }

  try {
    const response = await apiClient.post<PredictionRequest, PredictionResponse>('/predict', request);
    return finalizePrediction({
      ...response,
      source: 'backend',
      submittedRequest: request,
    }, itinerarySummary);
  } catch (error) {
    console.warn('Prediction API request failed; using mock response instead.', error);
    return finalizePrediction(generateMockPrediction(request), itinerarySummary);
  }
}

export function generateMockPrediction(
  data: PredictionRequest,
): PredictionResponse {
  const { probability, riskLevel, factors } = computeLegScore(data, data.originAirport, data.destinationAirport);

  const baseExplanation = factors.length > 0
    ? `Based on the flight details, there's a ${riskLevel} delay risk due to ${factors.join(', ')}. `
    : 'Based on the flight details, conditions appear favorable. ';

  const guidance = getGuidance(riskLevel, data.originAirport, data.destinationAirport);

  return {
    probability,
    riskLevel,
    explanation: `${baseExplanation}${guidance}`,
    source: 'mock_fallback',
    submittedRequest: data,
  };
}

const resolveRisk = (probability: number): RiskLevel => {
  if (probability < 30) return 'low';
  if (probability < 70) return 'moderate';
  return 'high';
};

const getGuidance = (riskLevel: RiskLevel, origin: string, destination: string): string => {
  if (riskLevel === 'low') {
    return `The ${origin} to ${destination} route generally maintains good on-time performance under these conditions. Consider arriving at the recommended time before departure.`;
  }

  if (riskLevel === 'moderate') {
    return 'The combination of route characteristics and current conditions suggests some delay potential. We recommend monitoring your flight status closely and allowing extra time for connections.';
  }

  return 'Multiple factors indicate elevated delay risk for this flight. Consider backup plans for tight connections and check with your airline for real-time updates.';
};

const clampProbability = (value: number) => Math.min(95, Math.max(5, value));

const getDepartureHour = (departureTime: string) => {
  const hour = parseInt(departureTime.split(':')[0] ?? '0', 10);
  return Number.isNaN(hour) ? 0 : hour;
};

const getAirportTrafficWeight = (airport: string) => {
  if (HIGH_TRAFFIC_AIRPORTS.has(airport)) return 8;
  if (MEDIUM_TRAFFIC_AIRPORTS.has(airport)) return 4;
  return airport ? 2 : 0;
};

const getRouteFactor = (origin: string, destination: string) => {
  const routeWeight = getAirportTrafficWeight(origin) + getAirportTrafficWeight(destination);
  if (routeWeight >= 12) return { score: 10, label: 'busy hub traffic' };
  if (routeWeight >= 7) return { score: 6, label: 'steady airport traffic' };
  if (routeWeight > 0) return { score: 3, label: 'route handoff complexity' };
  return { score: 0, label: '' };
};

const computeLegScore = (
  data: PredictionRequest,
  origin: string,
  destination: string,
  penalty = 0,
): { probability: number; riskLevel: RiskLevel; factors: string[] } => {
  let probability = 25;
  const factors: string[] = [];

  if (data.precipitation === 'snow') {
    probability += 35;
    factors.push('winter weather conditions');
  } else if (data.precipitation === 'thunderstorms') {
    probability += 30;
    factors.push('severe weather');
  } else if (data.precipitation === 'rain') {
    probability += 15;
    factors.push('rain conditions');
  } else if (data.precipitation === 'sleet') {
    probability += 18;
    factors.push('mixed precipitation');
  }

  if (data.wind === 'strong') {
    probability += 20;
    factors.push('strong winds');
  } else if (data.wind === 'moderate') {
    probability += 10;
    factors.push('moderate winds');
  }

  const hour = getDepartureHour(data.departureTime);
  if (hour >= 6 && hour <= 9) {
    probability += 12;
    factors.push('morning rush hour');
  } else if (hour >= 17 && hour <= 20) {
    probability += 15;
    factors.push('evening peak hours');
  }

  const duration = parseInt(data.duration || '0', 10);
  if (!Number.isNaN(duration) && duration > 300) {
    probability += 8;
    factors.push('long-haul timing');
  }

  const routeFactor = getRouteFactor(origin, destination);
  probability += routeFactor.score;
  if (routeFactor.label) {
    factors.push(routeFactor.label);
  }

  probability = clampProbability(probability + penalty);
  return {
    probability,
    riskLevel: resolveRisk(probability),
    factors,
  };
};

const buildLegExplanation = (riskLevel: RiskLevel, factors: string[]) => {
  if (factors.length === 0) {
    return `This leg shows ${riskLevel} delay risk under stable conditions.`;
  }

  const detail = factors.slice(0, 2).join(' and ');
  return `This leg shows ${riskLevel} delay risk due to ${detail}.`;
};

const buildItinerarySummary = (
  request: PredictionRequest,
  normalizedConnections: string[],
): ItineraryPredictionSummary | undefined => {
  const stops = [
    request.originAirport,
    ...normalizedConnections.filter(Boolean),
    request.destinationAirport,
  ];

  const legs = stops
    .slice(0, -1)
    .map((from, index) => ({
      from,
      to: stops[index + 1] ?? '',
      index,
    }))
    .filter((leg) => leg.from && leg.to);

  if (normalizedConnections.filter(Boolean).length === 0 || legs.length === 0) {
    return undefined;
  }

  const legPredictions: LegPrediction[] = legs.map((leg, index) => {
    const penalty = index < legs.length - 1 ? 6 : 3;
    const scoredLeg = computeLegScore(request, leg.from, leg.to, penalty);
    return {
      from: leg.from,
      to: leg.to,
      probability: scoredLeg.probability,
      riskLevel: scoredLeg.riskLevel,
      explanation: buildLegExplanation(scoredLeg.riskLevel, scoredLeg.factors),
    };
  });

  const probabilities = legPredictions.map((leg) => leg.probability);
  const maxLegScore = Math.max(...probabilities);
  const averageLegScore = probabilities.reduce((sum, value) => sum + value, 0) / probabilities.length;
  const connectionCount = normalizedConnections.filter(Boolean).length;
  const aggregateProbability = clampProbability(
    Math.round((maxLegScore * 0.5) + (averageLegScore * 0.35) + (connectionCount * 5)),
  );
  const aggregateRiskLevel = resolveRisk(aggregateProbability);
  const highestLeg = legPredictions.reduce((current, leg) =>
    leg.probability > current.probability ? leg : current,
  );
  const routeLabel = stops.join(' -> ');

  return {
    legs: legPredictions,
    aggregateProbability,
    aggregateRiskLevel,
    aggregateExplanation: `This itinerary is estimated at ${aggregateProbability}% delay risk across ${routeLabel}, with the ${highestLeg.from} to ${highestLeg.to} leg contributing the most pressure.`,
  };
};

const finalizePrediction = (
  prediction: PredictionResponse,
  itinerarySummary?: ItineraryPredictionSummary,
): PredictionResponse => {
  if (!itinerarySummary || itinerarySummary.legs.length === 0) {
    return {
      ...prediction,
      itinerarySummary,
    };
  }

  return {
    ...prediction,
    baseProbability: prediction.probability,
    baseRiskLevel: prediction.riskLevel,
    baseExplanation: prediction.explanation,
    probability: itinerarySummary.aggregateProbability,
    riskLevel: itinerarySummary.aggregateRiskLevel,
    explanation: itinerarySummary.aggregateExplanation,
    itinerarySummary,
  };
};
