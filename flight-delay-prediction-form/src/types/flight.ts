export type PrecipitationType = 'none' | 'rain' | 'snow' | 'thunderstorms' | 'sleet';
export type WindCondition = 'calm' | 'moderate' | 'strong';
export type RiskLevel = 'low' | 'moderate' | 'high';

export interface Airport {
  code: string;
  name: string;
  city: string;
}

export interface FlightFormData {
  departureDate: string;
  departureTime: string;
  originAirport: string;
  destinationAirport: string;
  duration: string;
  temperature: string;
  precipitation: PrecipitationType;
  wind: WindCondition;
}

export type PredictionRequest = FlightFormData;

export interface PredictionResponse {
  probability: number;
  riskLevel: RiskLevel;
  explanation: string;
}
