import { describe, expect, it, vi } from 'vitest';

import type { PredictionExplanationContext } from '@/types';
import {
  answerResultChat,
  deriveContextDisclaimer,
  generateDeterministicResultChatResponse,
} from '@/services/localResultAssistant';

function buildContext(
  source: PredictionExplanationContext['source'] = 'backend',
  itinerary = false,
  pathUsed: 'hybrid_blend' | 'heuristic_fallback' = 'hybrid_blend',
): PredictionExplanationContext {
  return {
    source,
    submittedRequest: {
      departureDate: '2026-03-15',
      departureTime: '08:30',
      originAirport: 'JFK',
      destinationAirport: 'LAX',
      temperature: '72',
      precipitation: 'rain',
      wind: 'moderate',
      includeDebug: true,
    },
    displayedResult: {
      probability: itinerary ? 57 : 51,
      riskLevel: 'moderate',
      explanation: 'Displayed explanation.',
    },
    directRouteResult: itinerary
      ? {
          probability: 51,
          riskLevel: 'moderate',
          explanation: 'Direct-route explanation.',
        }
      : undefined,
    itinerarySummary: itinerary
      ? {
          aggregateProbability: 57,
          aggregateRiskLevel: 'moderate',
          aggregateExplanation: 'Aggregate itinerary explanation.',
          legs: [
            {
              originAirport: 'JFK',
              destinationAirport: 'ORD',
              probability: 52,
              riskLevel: 'moderate',
              explanation: 'Leg one explanation.',
            },
            {
              originAirport: 'ORD',
              destinationAirport: 'LAX',
              probability: 57,
              riskLevel: 'moderate',
              explanation: 'Leg two explanation.',
            },
          ],
        }
      : undefined,
    debug: source === 'mock_fallback'
      ? undefined
      : {
          pathUsed,
          modelLoaded: pathUsed === 'hybrid_blend',
          modelVersion: pathUsed === 'hybrid_blend' ? 'test-model' : null,
          datasetVersion: pathUsed === 'hybrid_blend' ? 'test-dataset' : null,
          rawInput: {
            departureDate: '2026-03-15',
            departureTime: '08:30',
            originAirport: 'JFK',
            destinationAirport: 'LAX',
            temperatureF: 72,
            precipitation: 'rain',
            wind: 'moderate',
          },
          derivedFeatures: {
            month: 3,
            arr_flights: 1700,
            weather_delay_norm: 0.35,
            nas_delay_norm: 0.28,
            security_delay_norm: 0.01,
            late_aircraft_delay_norm: 0.22,
            total_delay_norm: 0.56,
            route_congestion_score: 0.72,
            peak_departure_score: 0.48,
          },
          heuristicBreakdown: {
            baseScore: 11,
            routeContribution: 6,
            hubBonus: 4,
            timeOfDayContribution: 5,
            totalDelayContribution: 14,
            precipitationBonus: 5,
            windBonus: 3,
            weatherInteractionBonus: 0,
            unclampedTotal: 48,
            clampedTotal: 48,
          },
          blendInfo: {
            heuristicProbability: 48,
            modelProbability: pathUsed === 'hybrid_blend' ? 51 : null,
            rawModelDisagreement: pathUsed === 'hybrid_blend' ? 3 : null,
            maxModelShift: pathUsed === 'hybrid_blend' ? 3 : null,
            appliedAdjustment: pathUsed === 'hybrid_blend' ? 3 : null,
            blendMethod: pathUsed === 'hybrid_blend' ? 'heuristic_led_bounded_adjustment' : 'heuristic_only_fallback',
            reasoning: 'Grounded test reasoning.',
          },
          finalProbability: pathUsed === 'hybrid_blend' ? 51 : 48,
          fallbackReason: pathUsed === 'hybrid_blend' ? null : 'Heuristic-only test fallback.',
          notes: ['Grounded note.'],
        },
  };
}

describe('localResultAssistant', () => {
  it('derives the mock fallback disclaimer', () => {
    expect(deriveContextDisclaimer(buildContext('mock_fallback'))).toContain('mock fallback');
  });

  it('builds itinerary-aware deterministic responses', () => {
    const response = generateDeterministicResultChatResponse(
      buildContext('backend', true),
      'Explain the itinerary impact.',
      [],
    );

    expect(response.answer).toContain('itinerary-level score');
    expect(response.citations).toContain('itinerarySummary.legs');
    expect(response.suggestedFollowups).toContain('Explain the itinerary impact.');
  });

  it('falls back to the deterministic response when the local model fails', async () => {
    const context = buildContext();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const response = await answerResultChat(
      context,
      'Which factors mattered most here?',
      [],
      {
        enableLocalModel: true,
        loadGenerator: async () => {
          throw new Error('model load failed');
        },
      },
    );

    expect(response.answer).toContain('The main reasons surfaced by the current result are');
    expect(response.disclaimer).toContain('backend hybrid blend path');
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });

  it('uses the local model answer when it returns valid json', async () => {
    const response = await answerResultChat(
      buildContext(),
      'Summarize this result in plain language.',
      [{ role: 'user', content: 'Which factors mattered most?' }],
      {
        enableLocalModel: true,
        loadGenerator: async () => async () => '{"answer":"Short grounded local summary."}',
      },
    );

    expect(response.answer).toBe('Short grounded local summary.');
    expect(response.citations).toContain('displayedResult.explanation');
  });
});
