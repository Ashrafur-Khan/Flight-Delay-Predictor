import { useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import type { PredictionResponse, RiskLevel } from '@/types';

interface PredictionResultProps {
  prediction: PredictionResponse | null;
  isLoading: boolean;
  hasSubmitted: boolean;
}

const isDev = import.meta.env.DEV;

export function PredictionResult({ prediction, isLoading, hasSubmitted }: PredictionResultProps) {
  const [showDebug, setShowDebug] = useState(false);

  if (!hasSubmitted) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Prediction Yet</h3>
        <p className="text-gray-600">
          Enter your flight details and click "Predict Delay Probability" to see results.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8">
        <div className="animate-pulse">
          <div className="h-32 w-32 bg-gray-200 rounded-full mx-auto mb-6"></div>
          <div className="h-6 bg-gray-200 rounded w-3/4 mx-auto mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!prediction) return null;

  const getColorClass = (): string => {
    if (prediction.probability < 30) return 'text-green-600';
    if (prediction.probability < 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getBgColorClass = (): string => {
    if (prediction.probability < 30) return 'bg-green-50';
    if (prediction.probability < 70) return 'bg-yellow-50';
    return 'bg-red-50';
  };

  const getBorderColorClass = (): string => {
    if (prediction.probability < 30) return 'border-green-200';
    if (prediction.probability < 70) return 'border-yellow-200';
    return 'border-red-200';
  };

  const getRiskLabel = (): string => {
    switch (prediction.riskLevel) {
      case 'low':
        return 'Low Delay Risk';
      case 'moderate':
        return 'Moderate Delay Risk';
      case 'high':
        return 'High Delay Risk';
      default:
        return 'Delay Risk';
    }
  };

  const getRiskIcon = () => {
    switch (prediction.riskLevel) {
      case 'low':
        return <CheckCircle className="w-8 h-8" />;
      case 'moderate':
        return <AlertTriangle className="w-8 h-8" />;
      case 'high':
        return <AlertCircle className="w-8 h-8" />;
      default:
        return <AlertCircle className="w-8 h-8" />;
    }
  };

  const sourceLabel = prediction.source === 'mock_fallback' ? 'Frontend mock fallback' : 'Backend API';
  const sourceBadgeClass = prediction.source === 'mock_fallback'
    ? 'bg-red-100 text-red-700 border-red-200'
    : 'bg-blue-100 text-blue-700 border-blue-200';
  const submittedRequest = prediction.submittedRequest
    ? {
        departureDate: prediction.submittedRequest.departureDate,
        departureTime: prediction.submittedRequest.departureTime,
        originAirport: prediction.submittedRequest.originAirport,
        destinationAirport: prediction.submittedRequest.destinationAirport,
        duration: prediction.submittedRequest.duration,
        temperature: prediction.submittedRequest.temperature,
        precipitation: prediction.submittedRequest.precipitation,
        wind: prediction.submittedRequest.wind,
      }
    : null;
  const itinerarySummary = prediction.itinerarySummary;
  const hasConnectedItinerary = Boolean(itinerarySummary && itinerarySummary.legs.length > 0);

  return (
    <div className={`bg-white rounded-lg shadow-md p-8 border-2 ${getBorderColorClass()}`}>
      <div className="text-center mb-6">
        <div className={`inline-flex items-center justify-center w-40 h-40 rounded-full ${getBgColorClass()} mb-4 relative`}>
          <div className={`absolute inset-0 rounded-full ${getBgColorClass()} opacity-50 animate-pulse`}></div>
          <span className={`text-6xl font-bold ${getColorClass()} relative z-10`}>
            {prediction.probability}%
          </span>
        </div>

        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${getBgColorClass()} ${getColorClass()} mb-2`}>
          {getRiskIcon()}
          <span className="font-semibold text-lg">{getRiskLabel()}</span>
        </div>
      </div>

      <div className={`${getBgColorClass()} rounded-lg p-6 border ${getBorderColorClass()}`}>
        <h3 className="font-semibold text-gray-900 mb-3">Analysis</h3>
        <p className="text-gray-700 leading-relaxed">
          {prediction.explanation}
        </p>
      </div>

      {itinerarySummary && itinerarySummary.legs.length > 0 && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50/80 p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-900">
              Itinerary Breakdown
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              These segment scores explain the main connected-itinerary prediction shown above.
            </p>
          </div>

          <div className="space-y-3">
            {itinerarySummary.legs.map((leg, index) => (
              <div
                key={`${leg.from}-${leg.to}-${index}`}
                className="rounded-lg border border-gray-200 bg-white px-4 py-3"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Leg {index + 1}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">
                      {leg.from} to {leg.to}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">{leg.explanation}</p>
                  </div>

                  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold ${getRiskBadgeClass(leg.riskLevel)}`}>
                    {leg.probability}% {getShortRiskLabel(leg.riskLevel)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isDev && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={() => setShowDebug(prev => !prev)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <div>
              <p className="text-sm font-semibold text-slate-900">Debug Details</p>
              <p className="text-xs text-slate-600">Inspect the exact scoring path used for this result.</p>
            </div>
            {showDebug ? <ChevronUp className="h-4 w-4 text-slate-600" /> : <ChevronDown className="h-4 w-4 text-slate-600" />}
          </button>

          {showDebug && (
            <div className="border-t border-slate-200 px-4 py-4 space-y-4 text-sm text-slate-700">
              <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${sourceBadgeClass}`}>
                Source: {sourceLabel}
              </div>

              {prediction.source === 'mock_fallback' && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">
                  The backend response was not used for this result. This prediction came from the frontend fallback.
                </p>
              )}

              <DebugBlock title="Submitted Request" value={submittedRequest} />

              {prediction.debug ? (
                <>
                  <DebugGrid
                    items={[
                      ['Path used', prediction.debug.pathUsed],
                      ['Model loaded', String(prediction.debug.modelLoaded)],
                      ['Model version', prediction.debug.modelVersion ?? 'Unavailable'],
                      ['Dataset version', prediction.debug.datasetVersion ?? 'Unavailable'],
                      ...(hasConnectedItinerary
                        ? [
                            ['Displayed itinerary score', `${prediction.probability}%`],
                            ['Raw backend/direct-route score', prediction.baseProbability === undefined ? 'Unavailable' : `${prediction.baseProbability}%`],
                          ] as [string, string][]
                        : []),
                      ...(prediction.debug.blendInfo
                        ? [
                            ['Heuristic score', `${prediction.debug.blendInfo.heuristicProbability}%`],
                            ['Model score', prediction.debug.blendInfo.modelProbability === null ? 'Unavailable' : `${prediction.debug.blendInfo.modelProbability}%`],
                            ['Applied adjustment', prediction.debug.blendInfo.appliedAdjustment === null ? 'Unavailable' : `${prediction.debug.blendInfo.appliedAdjustment > 0 ? '+' : ''}${prediction.debug.blendInfo.appliedAdjustment} pts`],
                          ] as [string, string][]
                        : []),
                      ['Final probability', `${prediction.debug.finalProbability}%`],
                    ]}
                  />
                  {prediction.debug.fallbackReason && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                      {prediction.debug.fallbackReason}
                    </p>
                  )}
                  {prediction.debug.blendInfo && (
                    <div className="rounded-md border border-slate-200 bg-white px-3 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Hybrid Blend Reasoning
                      </p>
                      <p className="mt-2 text-sm text-slate-700">{prediction.debug.blendInfo.reasoning}</p>
                    </div>
                  )}
                  {hasConnectedItinerary && prediction.baseExplanation && (
                    <div className="rounded-md border border-slate-200 bg-white px-3 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Raw Direct-Route Explanation
                      </p>
                      <p className="mt-2 text-sm text-slate-700">{prediction.baseExplanation}</p>
                    </div>
                  )}
                  <DebugBlock title="Normalized Raw Input" value={prediction.debug.rawInput} />
                  <DebugBlock title="Derived Features" value={prediction.debug.derivedFeatures} />
                  <DebugBlock title="Heuristic Breakdown" value={prediction.debug.heuristicBreakdown} />
                  <DebugBlock title="Blend Details" value={prediction.debug.blendInfo} />
                  {prediction.debug.notes.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</p>
                      <ul className="space-y-2">
                        {prediction.debug.notes.map((note) => (
                          <li key={note} className="rounded-md border border-slate-200 bg-white px-3 py-2">
                            {note}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {hasConnectedItinerary && prediction.baseProbability !== undefined && (
                    <DebugGrid
                      items={[
                        ['Displayed itinerary score', `${prediction.probability}%`],
                        ['Raw direct-route score', `${prediction.baseProbability}%`],
                      ]}
                    />
                  )}
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                    No backend debug payload was returned for this prediction.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 pt-6 border-t border-gray-200">
        <p className="text-sm text-gray-600 text-center">
          Tip: Adjust inputs to see how different factors affect delay probability.
        </p>
      </div>
    </div>
  );
}

function getRiskBadgeClass(riskLevel: RiskLevel) {
  if (riskLevel === 'low') return 'border-green-200 bg-green-50 text-green-700';
  if (riskLevel === 'moderate') return 'border-yellow-200 bg-yellow-50 text-yellow-700';
  return 'border-red-200 bg-red-50 text-red-700';
}

function getShortRiskLabel(riskLevel: RiskLevel) {
  if (riskLevel === 'low') return 'Low Risk';
  if (riskLevel === 'moderate') return 'Moderate Risk';
  return 'High Risk';
}

function DebugBlock({ title, value }: { title: string; value: unknown }) {
  if (!value) {
    return null;
  }

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <pre className="overflow-x-auto rounded-md border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-700">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function DebugGrid({ items }: { items: [string, string][] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-md border border-slate-200 bg-white px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-sm text-slate-800">{value}</p>
        </div>
      ))}
    </div>
  );
}
