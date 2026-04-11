import type {
  PredictionExplanationContext,
  PredictionExplanationLeg,
  PredictionResponse,
  ResultAssistantMessage,
  ResultChatResponse,
} from '@/types';
import { answerResultChat, deriveContextDisclaimer } from '@/services/localResultAssistant';

export const buildPredictionExplanationContext = (
  prediction: PredictionResponse | null,
): PredictionExplanationContext | null => {
  if (!prediction?.submittedRequest || !prediction.source) {
    return null;
  }

  const itinerarySummary = prediction.itinerarySummary
    ? {
        aggregateProbability: prediction.itinerarySummary.aggregateProbability,
        aggregateRiskLevel: prediction.itinerarySummary.aggregateRiskLevel,
        aggregateExplanation: prediction.itinerarySummary.aggregateExplanation,
        legs: prediction.itinerarySummary.legs.map<PredictionExplanationLeg>((leg) => ({
          originAirport: leg.from,
          destinationAirport: leg.to,
          probability: leg.probability,
          riskLevel: leg.riskLevel,
          explanation: leg.explanation,
        })),
      }
    : undefined;

  return {
    source: prediction.source,
    submittedRequest: prediction.submittedRequest,
    displayedResult: {
      probability: prediction.probability,
      riskLevel: prediction.riskLevel,
      explanation: prediction.explanation,
    },
    directRouteResult: prediction.baseProbability !== undefined && prediction.baseRiskLevel && prediction.baseExplanation
      ? {
          probability: prediction.baseProbability,
          riskLevel: prediction.baseRiskLevel,
          explanation: prediction.baseExplanation,
        }
      : undefined,
    itinerarySummary,
    debug: prediction.debug,
  };
};

export const getSuggestedAssistantPrompts = (
  context: PredictionExplanationContext | null,
): string[] => {
  if (!context) {
    return [];
  }

  const prompts = [
    'Why is this risk rated this way?',
    'Which factors mattered most?',
    'Summarize this result in plain language.',
  ];

  if (context.itinerarySummary) {
    prompts.push('Explain the itinerary impact.');
  }

  if (context.debug?.blendInfo) {
    prompts.push('What does hybrid blend mean?');
  }

  if (context.source === 'mock_fallback') {
    prompts.push('What makes this a mock fallback result?');
  }

  return prompts.slice(0, 4);
};

export const getAssistantContextNotice = (
  context: PredictionExplanationContext | null,
): string | null => {
  if (!context) {
    return null;
  }

  return deriveContextDisclaimer(context);
};

export const submitResultChat = async (
  context: PredictionExplanationContext,
  question: string,
  conversationHistory: ResultAssistantMessage[],
): Promise<ResultChatResponse> => {
  return answerResultChat(context, question, conversationHistory);
};
