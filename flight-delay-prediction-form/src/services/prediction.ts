import { createApiClient } from '@/lib/api';
import type { PredictionRequest, PredictionResponse, RiskLevel } from '@/types';

const apiClient = createApiClient();

export async function submitPrediction(data: PredictionRequest): Promise<PredictionResponse> {
  if (!apiClient.baseUrl) {
    console.info('API base URL not configured. Falling back to mock prediction.');
    return generateMockPrediction(data);
  }

  try {
    return await apiClient.post<PredictionRequest, PredictionResponse>('/predict', data);
  } catch (error) {
    console.warn('Prediction API request failed; using mock response instead.', error);
    return generateMockPrediction(data);
  }
}

export function generateMockPrediction(data: PredictionRequest): PredictionResponse {
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
  }

  if (data.wind === 'strong') {
    probability += 20;
    factors.push('strong winds');
  } else if (data.wind === 'moderate') {
    probability += 10;
  }

  if (data.departureTime) {
    const hour = parseInt(data.departureTime.split(':')[0] ?? '0', 10);
    if (hour >= 6 && hour <= 9) {
      probability += 12;
      factors.push('morning rush hour');
    } else if (hour >= 17 && hour <= 20) {
      probability += 15;
      factors.push('evening peak hours');
    }
  }

  const duration = parseInt(data.duration || '0', 10);
  if (!Number.isNaN(duration) && duration > 300) {
    probability += 8;
    factors.push('long-haul flight');
  }

  probability = Math.min(95, Math.max(5, probability));
  const riskLevel = resolveRisk(probability);

  const baseExplanation = factors.length > 0
    ? `Based on the flight details, there's a ${riskLevel} delay risk due to ${factors.join(', ')}. `
    : 'Based on the flight details, conditions appear favorable. ';

  const guidance = getGuidance(riskLevel, data.originAirport, data.destinationAirport);

  return { probability, riskLevel, explanation: `${baseExplanation}${guidance}` };
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
