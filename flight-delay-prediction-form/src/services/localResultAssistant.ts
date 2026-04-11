import type {
  PredictionExplanationContext,
  PredictionExplanationLeg,
  ResultAssistantMessage,
  ResultChatResponse,
} from '@/types';

type LocalTextGenerator = (prompt: string) => Promise<string>;

interface AnswerResultChatOptions {
  enableLocalModel?: boolean;
  loadGenerator?: () => Promise<LocalTextGenerator>;
}

interface DeviceNavigator extends Navigator {
  gpu?: {
    requestAdapter?: () => Promise<unknown>;
  };
  deviceMemory?: number;
}

const LOCAL_MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct';
const LOCAL_MODEL_MAX_HISTORY = 4;
const LOCAL_MODEL_MAX_TOKENS = 140;
const LOCAL_MODEL_ENABLED = import.meta.env.VITE_ENABLE_LOCAL_RESULT_ASSISTANT_MODEL === 'true';

let cachedGeneratorPromise: Promise<LocalTextGenerator> | null = null;

export function deriveContextDisclaimer(context: PredictionExplanationContext): string | null {
  if (context.source === 'mock_fallback') {
    return 'This answer is grounded in the frontend mock fallback result, not a live backend prediction.';
  }

  if (!context.debug) {
    return null;
  }

  if (context.debug.pathUsed === 'heuristic_fallback') {
    return 'This answer is grounded in the backend heuristic fallback path because no trained model artifact was active for this result.';
  }

  if (context.debug.pathUsed === 'hybrid_blend') {
    return 'This answer is grounded in the backend hybrid blend path, where the trained model can only make a bounded adjustment to the heuristic score.';
  }

  return null;
}

export function buildContextSnapshot(context: PredictionExplanationContext): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {
    source: context.source,
    submittedRequest: {
      departureDate: context.submittedRequest.departureDate,
      departureTime: context.submittedRequest.departureTime,
      originAirport: context.submittedRequest.originAirport,
      destinationAirport: context.submittedRequest.destinationAirport,
      temperature: context.submittedRequest.temperature,
      precipitation: context.submittedRequest.precipitation,
      wind: context.submittedRequest.wind,
    },
    displayedResult: {
      probability: context.displayedResult.probability,
      riskLevel: context.displayedResult.riskLevel,
      explanation: context.displayedResult.explanation,
    },
  };

  if (context.directRouteResult) {
    snapshot.directRouteResult = {
      probability: context.directRouteResult.probability,
      riskLevel: context.directRouteResult.riskLevel,
      explanation: context.directRouteResult.explanation,
    };
  }

  if (context.itinerarySummary) {
    snapshot.itinerarySummary = {
      aggregateProbability: context.itinerarySummary.aggregateProbability,
      aggregateRiskLevel: context.itinerarySummary.aggregateRiskLevel,
      aggregateExplanation: context.itinerarySummary.aggregateExplanation,
      legs: context.itinerarySummary.legs.map((leg) => ({
        originAirport: leg.originAirport,
        destinationAirport: leg.destinationAirport,
        probability: leg.probability,
        riskLevel: leg.riskLevel,
        explanation: leg.explanation,
      })),
    };
  }

  if (context.debug) {
    snapshot.debug = context.debug;
  }

  return snapshot;
}

function buildSystemPrompt(context: PredictionExplanationContext): string {
  const guardrails = [
    'You are a grounded flight delay result explainer.',
    'Use only the structured prediction context that is provided to you.',
    'Do not invent new scores, new model behavior, live weather, airline operations, or unseen features.',
    'Do not imply that connected itineraries were scored by a learned multi-leg backend model.',
    'If information is missing, say it is unavailable in the current result.',
    'Treat the deterministic displayed result as the source of truth.',
    'Keep answers concise, factual, and specific to the result.',
  ];

  const disclaimer = deriveContextDisclaimer(context);
  if (disclaimer) {
    guardrails.push(`Important context: ${disclaimer}`);
  }

  if (context.itinerarySummary) {
    guardrails.push(
      'This result includes a frontend itinerary summary layered on top of a direct-route prediction. Explain the displayed itinerary score separately from the raw direct-route score when relevant.',
    );
  }

  return guardrails.join(' ');
}

function citationFieldsForContext(context: PredictionExplanationContext): string[] {
  const citations = [
    'submittedRequest.originAirport',
    'submittedRequest.destinationAirport',
    'submittedRequest.departureDate',
    'submittedRequest.departureTime',
    'displayedResult.probability',
    'displayedResult.riskLevel',
    'displayedResult.explanation',
  ];

  if (context.itinerarySummary) {
    citations.push(
      'itinerarySummary.aggregateProbability',
      'itinerarySummary.aggregateExplanation',
      'itinerarySummary.legs',
    );
  }

  if (context.directRouteResult) {
    citations.push('directRouteResult.probability');
  }

  if (context.debug) {
    citations.push(
      'debug.pathUsed',
      'debug.derivedFeatures',
      'debug.notes',
    );
    if (context.debug.blendInfo) {
      citations.push('debug.blendInfo');
    }
  }

  return citations;
}

export function buildSuggestedFollowups(context: PredictionExplanationContext): string[] {
  const prompts = [
    'Which factors mattered most here?',
    'Summarize this result in plain language.',
  ];

  if (context.itinerarySummary) {
    prompts.push('Explain the itinerary impact.');
  }

  if (context.debug?.blendInfo) {
    prompts.push('What does hybrid blend mean here?');
  }

  return prompts.slice(0, 4);
}

function topFeatureLabels(context: PredictionExplanationContext): string[] {
  const labels: string[] = [];

  if (context.submittedRequest.precipitation !== 'none') {
    labels.push(context.submittedRequest.precipitation);
  }

  if (context.submittedRequest.wind !== 'calm') {
    labels.push(`${context.submittedRequest.wind} wind`);
  }

  if (context.debug) {
    if (context.debug.derivedFeatures.route_congestion_score >= 0.55) {
      labels.push('busy route conditions');
    }

    if (context.debug.derivedFeatures.peak_departure_score >= 0.35) {
      labels.push('peak departure traffic');
    }
  }

  return labels;
}

function highestPressureLeg(legs: PredictionExplanationLeg[]): PredictionExplanationLeg | null {
  if (legs.length === 0) {
    return null;
  }

  return legs.reduce((highest, leg) => (leg.probability > highest.probability ? leg : highest), legs[0]);
}

export function generateDeterministicResultChatResponse(
  context: PredictionExplanationContext,
  question: string,
  history: ResultAssistantMessage[],
): ResultChatResponse {
  void history;

  const normalizedQuestion = question.trim().toLowerCase();
  const citations = citationFieldsForContext(context);
  const disclaimer = deriveContextDisclaimer(context);

  let answer: string;
  if (normalizedQuestion.includes('hybrid') && context.debug?.blendInfo) {
    const blend = context.debug.blendInfo;
    answer = `The backend labeled this as \`${context.debug.pathUsed}\`. The heuristic score was ${blend.heuristicProbability}% and the trained model score was ${blend.modelProbability ?? 'unavailable'}%. The final displayed direct-route score used a bounded adjustment of ${blend.appliedAdjustment ?? 0} points, and the displayed top-level score remains ${context.displayedResult.probability}%.`;
  } else if (normalizedQuestion.includes('itinerary') && context.itinerarySummary) {
    const highestLeg = highestPressureLeg(context.itinerarySummary.legs);
    const highestLegText = highestLeg
      ? ` The highest-pressure leg was ${highestLeg.originAirport} to ${highestLeg.destinationAirport} at ${highestLeg.probability}%.`
      : '';
    answer = `The displayed result is an itinerary-level score of ${context.itinerarySummary.aggregateProbability}% ${context.itinerarySummary.aggregateRiskLevel} risk, built on top of the direct-route result of ${context.directRouteResult?.probability ?? context.displayedResult.probability}%.${highestLegText}`;
  } else if (normalizedQuestion.includes('factor') || normalizedQuestion.includes('why')) {
    const factorLabels = topFeatureLabels(context);
    const factorText = factorLabels.length > 0
      ? factorLabels.join(', ')
      : 'the route, timing, and current operating conditions summarized in the result';
    answer = `The main reasons surfaced by the current result are ${factorText}. The displayed score is ${context.displayedResult.probability}% with a ${context.displayedResult.riskLevel} risk label, and the deterministic explanation says: ${context.displayedResult.explanation}`;
  } else {
    answer = `This result shows ${context.displayedResult.probability}% ${context.displayedResult.riskLevel} delay risk for ${context.submittedRequest.originAirport} to ${context.submittedRequest.destinationAirport}. ${context.displayedResult.explanation}`;
  }

  return {
    answer,
    citations,
    disclaimer,
    suggestedFollowups: buildSuggestedFollowups(context),
  };
}

function browserCanUseLocalModel(): boolean {
  if (!LOCAL_MODEL_ENABLED || typeof navigator === 'undefined') {
    return false;
  }

  const browserNavigator = navigator as DeviceNavigator;
  if (!browserNavigator.gpu?.requestAdapter) {
    return false;
  }

  if (typeof browserNavigator.deviceMemory === 'number' && browserNavigator.deviceMemory < 4) {
    return false;
  }

  if (typeof browserNavigator.hardwareConcurrency === 'number' && browserNavigator.hardwareConcurrency < 4) {
    return false;
  }

  return true;
}

function buildLocalModelPrompt(
  context: PredictionExplanationContext,
  question: string,
  history: ResultAssistantMessage[],
  draftAnswer: string,
): string {
  const recentHistory = history.slice(-LOCAL_MODEL_MAX_HISTORY);
  return [
    buildSystemPrompt(context),
    'Rewrite the grounded draft answer to be concise and natural without changing the facts.',
    'Return strict JSON with one field: {"answer":"..."}',
    `Prediction context:\n${JSON.stringify(buildContextSnapshot(context), null, 2)}`,
    `Recent conversation:\n${JSON.stringify(recentHistory, null, 2)}`,
    `User question: ${question}`,
    `Grounded draft answer: ${draftAnswer}`,
  ].join('\n\n');
}

function parseModelAnswer(rawText: string): string | null {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return null;
  }

  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as { answer?: unknown };
    if (typeof parsed.answer !== 'string') {
      return null;
    }

    const answer = parsed.answer.trim();
    return answer.length > 0 ? answer : null;
  } catch {
    return null;
  }
}

async function createLocalModelGenerator(): Promise<LocalTextGenerator> {
  const transformers = await import('@huggingface/transformers');
  const generator = await transformers.pipeline('text-generation', LOCAL_MODEL_ID, {
    dtype: 'q4',
    device: 'webgpu',
  });

  return async (prompt: string) => {
    const output = await generator(prompt, {
      max_new_tokens: LOCAL_MODEL_MAX_TOKENS,
      do_sample: false,
      repetition_penalty: 1.05,
      return_full_text: false,
    });

    const first = (Array.isArray(output) ? output[0] : output) as { generated_text?: unknown } | undefined;
    if (typeof first?.generated_text === 'string') {
      return first.generated_text;
    }

    return '';
  };
}

async function getLocalModelGenerator(): Promise<LocalTextGenerator> {
  if (!cachedGeneratorPromise) {
    cachedGeneratorPromise = createLocalModelGenerator();
  }

  return cachedGeneratorPromise;
}

export async function answerResultChat(
  context: PredictionExplanationContext,
  question: string,
  history: ResultAssistantMessage[],
  options: AnswerResultChatOptions = {},
): Promise<ResultChatResponse> {
  const deterministicResponse = generateDeterministicResultChatResponse(context, question, history);
  const shouldUseLocalModel = options.enableLocalModel ?? browserCanUseLocalModel();

  if (!shouldUseLocalModel) {
    return deterministicResponse;
  }

  try {
    const loadGenerator = options.loadGenerator ?? getLocalModelGenerator;
    const generator = await loadGenerator();
    const prompt = buildLocalModelPrompt(context, question, history, deterministicResponse.answer);
    const rawText = await generator(prompt);
    const refinedAnswer = parseModelAnswer(rawText);

    if (!refinedAnswer) {
      return deterministicResponse;
    }

    return {
      ...deterministicResponse,
      answer: refinedAnswer,
    };
  } catch (error) {
    console.warn('Local result assistant model unavailable; using deterministic fallback.', error);
    return deterministicResponse;
  }
}
