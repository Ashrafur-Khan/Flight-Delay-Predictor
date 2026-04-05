import { AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react';
import type { PredictionResponse, RiskLevel } from '@/types';

interface PredictionResultProps {
  prediction: PredictionResponse | null;
  isLoading: boolean;
  hasSubmitted: boolean;
}

export function PredictionResult({ prediction, isLoading, hasSubmitted }: PredictionResultProps) {
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

  const itinerarySummary = prediction.itinerarySummary;

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
