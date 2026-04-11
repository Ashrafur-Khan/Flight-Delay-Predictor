import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PredictionResult } from '../src/components/PredictionResult';
import {
  buildPredictionExplanationContext,
  getAssistantContextNotice,
  getSuggestedAssistantPrompts,
} from '../src/services/resultAssistant';
import type { PredictionResponse } from '../src/types';

const buildPrediction = (overrides: Partial<PredictionResponse> = {}): PredictionResponse => ({
  probability: 54,
  riskLevel: 'moderate',
  explanation: 'Displayed deterministic explanation.',
  source: 'backend',
  submittedRequest: {
    departureDate: '2026-05-15',
    departureTime: '08:30',
    originAirport: 'JFK',
    destinationAirport: 'LAX',
    temperature: '72',
    precipitation: 'rain',
    wind: 'moderate',
    includeDebug: true,
  },
  debug: {
    pathUsed: 'hybrid_blend',
    modelLoaded: true,
    modelVersion: 'demo-model',
    datasetVersion: 'demo-dataset',
    rawInput: {
      departureDate: '2026-05-15',
      departureTime: '08:30',
      originAirport: 'JFK',
      destinationAirport: 'LAX',
      temperatureF: 72,
      precipitation: 'rain',
      wind: 'moderate',
    },
    derivedFeatures: {
      month: 5,
      arr_flights: 1800,
      weather_delay_norm: 0.31,
      nas_delay_norm: 0.27,
      security_delay_norm: 0.02,
      late_aircraft_delay_norm: 0.22,
      total_delay_norm: 0.55,
      route_congestion_score: 0.67,
      peak_departure_score: 0.44,
    },
    heuristicBreakdown: {
      baseScore: 11,
      routeContribution: 5,
      hubBonus: 4,
      timeOfDayContribution: 5,
      totalDelayContribution: 13,
      precipitationBonus: 5,
      windBonus: 3,
      weatherInteractionBonus: 0,
      unclampedTotal: 46,
      clampedTotal: 46,
    },
    blendInfo: {
      heuristicProbability: 46,
      modelProbability: 49,
      rawModelDisagreement: 3,
      maxModelShift: 3,
      appliedAdjustment: 3,
      blendMethod: 'heuristic_led_bounded_adjustment',
      reasoning: 'Grounded test blend reasoning.',
    },
    finalProbability: 49,
    notes: ['Grounded note.'],
  },
  ...overrides,
});

describe('result assistant helpers', () => {
  it('builds a grounded context from an itinerary prediction', () => {
    const context = buildPredictionExplanationContext(buildPrediction({
      probability: 61,
      baseProbability: 49,
      baseRiskLevel: 'moderate',
      baseExplanation: 'Direct-route explanation.',
      itinerarySummary: {
        aggregateProbability: 61,
        aggregateRiskLevel: 'moderate',
        aggregateExplanation: 'Itinerary explanation.',
        legs: [
          { from: 'JFK', to: 'ORD', probability: 58, riskLevel: 'moderate', explanation: 'First leg.' },
          { from: 'ORD', to: 'LAX', probability: 61, riskLevel: 'moderate', explanation: 'Second leg.' },
        ],
      },
    }));

    expect(context?.itinerarySummary?.legs[0]).toEqual(expect.objectContaining({
      originAirport: 'JFK',
      destinationAirport: 'ORD',
    }));
    expect(context?.directRouteResult?.probability).toBe(49);
  });

  it('returns source-aware prompt suggestions and notices', () => {
    const context = buildPredictionExplanationContext(buildPrediction({
      source: 'mock_fallback',
      debug: undefined,
    }));

    expect(getSuggestedAssistantPrompts(context)).toContain('What makes this a mock fallback result?');
    expect(getAssistantContextNotice(context)).toContain('mock fallback');
  });
});

describe('PredictionResult assistant rendering', () => {
  it('shows the assistant panel only when a prediction exists', () => {
    const emptyMarkup = renderToStaticMarkup(
      <PredictionResult prediction={null} isLoading={false} hasSubmitted={false} />,
    );
    const filledMarkup = renderToStaticMarkup(
      <PredictionResult prediction={buildPrediction()} isLoading={false} hasSubmitted />,
    );

    expect(emptyMarkup).not.toContain('Ask About This Result');
    expect(filledMarkup).toContain('Ask About This Result');
    expect(filledMarkup).toContain('What does hybrid blend mean?');
  });

  it('renders the mock-fallback context notice in the assistant panel', () => {
    const markup = renderToStaticMarkup(
      <PredictionResult
        prediction={buildPrediction({
          source: 'mock_fallback',
          debug: undefined,
        })}
        isLoading={false}
        hasSubmitted
      />,
    );

    expect(markup).toContain('frontend mock fallback result');
  });
});
