import { useEffect, useState } from 'react';
import type { PredictionResponse, ResultAssistantMessage, ResultChatResponse } from '@/types';
import { isReleaseUi } from '@/lib/releaseMode';
import {
  buildPredictionExplanationContext,
  getAssistantContextNotice,
  getSuggestedAssistantPrompts,
  submitResultChat,
} from '@/services/resultAssistant';

interface ResultAssistantProps {
  prediction: PredictionResponse;
}

export function ResultAssistant({ prediction }: ResultAssistantProps) {
  const context = buildPredictionExplanationContext(prediction);
  const suggestedPrompts = getSuggestedAssistantPrompts(context);
  const contextNotice = getAssistantContextNotice(context);
  const [question, setQuestion] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ResultAssistantMessage[]>([]);
  const [latestResponse, setLatestResponse] = useState<ResultChatResponse | null>(null);

  useEffect(() => {
    setQuestion('');
    setError(null);
    setMessages([]);
    setLatestResponse(null);
  }, [
    prediction.probability,
    prediction.riskLevel,
    prediction.explanation,
    prediction.baseProbability,
    prediction.source,
  ]);

  if (!context) {
    return null;
  }

  const handleSubmit = async (prompt: string) => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    const nextHistory: ResultAssistantMessage[] = [...messages, { role: 'user', content: trimmedPrompt }];
    setMessages(nextHistory);

    try {
      const response = await submitResultChat(
        context,
        trimmedPrompt,
        messages.slice(-4),
      );
      setLatestResponse(response);
      setMessages([...nextHistory, { role: 'assistant', content: response.answer }]);
      setQuestion('');
    } catch (submitError) {
      setError('Assistant details are unavailable right now. The deterministic explanation above is still the source of truth.');
      setMessages(messages);
      console.error('Result assistant request failed', submitError);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-900">
          Ask About This Result
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          This assistant can clarify the current result, itinerary impact, and debug-derived factors without changing the score.
        </p>
      </div>

      {contextNotice && (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {contextNotice}
        </p>
      )}

      {suggestedPrompts.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setQuestion(prompt)}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-700"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {messages.length > 0 && (
          <div className="space-y-3">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={message.role === 'assistant'
                  ? 'rounded-lg border border-blue-100 bg-white px-4 py-3 text-sm text-slate-700'
                  : 'rounded-lg border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-800'}
              >
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {message.role === 'assistant' ? 'Assistant' : 'You'}
                </p>
                <p>{message.content}</p>
              </div>
            ))}
          </div>
        )}

        <div>
          <label htmlFor="result-assistant-question" className="mb-2 block text-sm font-medium text-slate-800">
            Ask a follow-up question
          </label>
          <textarea
            id="result-assistant-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={3}
            placeholder="Why is this risk high, and which factors mattered most?"
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500 sm:flex-1">
            The assistant is grounded to the current prediction only.
          </p>
          <button
            type="button"
            onClick={() => void handleSubmit(question)}
            disabled={!question.trim() || isSubmitting}
            className="self-start rounded-lg border border-slate-900 px-4 py-2 text-sm font-medium shadow-sm transition-colors disabled:cursor-not-allowed disabled:border-slate-300 sm:self-auto"
            style={{
              minWidth: '5.5rem',
              backgroundColor: !question.trim() || isSubmitting ? '#94a3b8' : '#0f172a',
              color: '#ffffff',
            }}
          >
            {isSubmitting ? 'Explaining...' : 'Ask'}
          </button>
        </div>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {latestResponse?.disclaimer && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {latestResponse.disclaimer}
          </p>
        )}

        {!isReleaseUi && latestResponse?.citations?.length ? (
          <div className="rounded-md border border-slate-200 bg-white px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Grounded Fields</p>
            <p className="mt-2 text-xs text-slate-600">{latestResponse.citations.join(', ')}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
