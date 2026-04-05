export type PrecipitationType = 'none' | 'rain' | 'snow' | 'thunderstorms' | 'sleet';
export type WindCondition = 'calm' | 'moderate' | 'strong';
export type RiskLevel = 'low' | 'moderate' | 'high';
export type PredictionSource = 'backend' | 'mock_fallback';
export type PredictionPath = 'hybrid_blend' | 'model_artifact' | 'heuristic_fallback';

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
  connections: string[];
  temperature: string;
  precipitation: PrecipitationType;
  wind: WindCondition;
}

export type FlightValidationIssueCode =
  | 'same_origin_destination'
  | 'duplicate_consecutive_stop'
  | 'invalid_airport'
  | 'blank_layover'
  | 'invalid_temperature'
  | 'weather_mismatch';

export type ValidationSeverity = 'error' | 'warning';

export interface FlightValidationIssue {
  code: FlightValidationIssueCode;
  message: string;
  severity: ValidationSeverity;
  stopIndex?: number;
  field?: 'originAirport' | 'destinationAirport' | 'connections' | 'temperature' | 'precipitation' | 'wind';
}

export interface FlightValidationResult {
  blockingIssues: FlightValidationIssue[];
  warnings: FlightValidationIssue[];
}

export interface PredictionRequest {
  departureDate: string;
  departureTime: string;
  originAirport: string;
  destinationAirport: string;
  temperature: string;
  precipitation: PrecipitationType;
  wind: WindCondition;
  includeDebug?: boolean;
}

export interface LegPrediction {
  from: string;
  to: string;
  probability: number;
  riskLevel: RiskLevel;
  explanation: string;
}

export interface ItineraryPredictionSummary {
  legs: LegPrediction[];
  aggregateProbability: number;
  aggregateRiskLevel: RiskLevel;
  aggregateExplanation: string;
}

export interface PredictionDebugRawInput {
  departureDate: string;
  departureTime: string;
  originAirport: string;
  destinationAirport: string;
  temperatureF: number;
  precipitation: PrecipitationType;
  wind: WindCondition;
}

export interface PredictionDebugDerivedFeatures {
  month: number;
  arr_flights: number;
  weather_delay_norm: number;
  nas_delay_norm: number;
  security_delay_norm: number;
  late_aircraft_delay_norm: number;
  total_delay_norm: number;
  route_congestion_score: number;
  peak_departure_score: number;
}

export interface PredictionDebugScoreBreakdown {
  baseScore: number;
  routeContribution: number;
  hubBonus: number;
  timeOfDayContribution: number;
  totalDelayContribution: number;
  precipitationBonus: number;
  windBonus: number;
  weatherInteractionBonus: number;
  unclampedTotal: number;
  clampedTotal: number;
}

export interface PredictionDebugBlendInfo {
  heuristicProbability: number;
  modelProbability: number | null;
  rawModelDisagreement: number | null;
  maxModelShift: number | null;
  appliedAdjustment: number | null;
  blendMethod: string;
  reasoning: string;
}

export interface PredictionDebugInfo {
  pathUsed: PredictionPath;
  modelLoaded: boolean;
  modelVersion: string | null;
  datasetVersion: string | null;
  rawInput: PredictionDebugRawInput;
  derivedFeatures: PredictionDebugDerivedFeatures;
  heuristicBreakdown?: PredictionDebugScoreBreakdown | null;
  blendInfo?: PredictionDebugBlendInfo | null;
  finalProbability: number;
  fallbackReason?: string | null;
  notes: string[];
}

export interface PredictionResponse {
  probability: number;
  riskLevel: RiskLevel;
  explanation: string;
  baseProbability?: number;
  baseRiskLevel?: RiskLevel;
  baseExplanation?: string;
  debug?: PredictionDebugInfo;
  itinerarySummary?: ItineraryPredictionSummary;
  source?: PredictionSource;
  submittedRequest?: PredictionRequest;
}
