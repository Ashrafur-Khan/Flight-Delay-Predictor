import { useState } from 'react';
import { AirportInput } from './AirportInput';
import { PredictionResult } from './PredictionResult';
import { ChevronDown, ChevronUp, Plane } from 'lucide-react';
import type { FlightFormData, PredictionResponse } from '@/types';
import { submitPrediction } from '@/services/prediction';

export function FlightDelayPredictor() {
  const [formData, setFormData] = useState<FlightFormData>({
    departureDate: '',
    departureTime: '',
    originAirport: '',
    destinationAirport: '',
    duration: '',
    temperature: '',
    precipitation: 'none',
    wind: 'calm',
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = <Field extends keyof FlightFormData>(
    field: Field,
    value: FlightFormData[Field],
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePredict = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await submitPrediction(formData);
      setPrediction(result);
    } catch (predictionError) {
      console.error('Prediction request failed', predictionError);
      setError('Unable to fetch a prediction right now. Please try again shortly.');
      setPrediction(null);
    } finally {
      setIsLoading(false);
    }
  };

  const isFormValid = formData.departureDate && 
                       formData.departureTime && 
                       formData.originAirport && 
                       formData.destinationAirport;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <Plane className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">Flight Delay Predictor</h1>
        </div>
        <p className="text-gray-600">Enter your flight details to predict delay probability</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Input Panel */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-6 text-gray-900">Flight Details</h2>
          
          {/* Core Inputs */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Flight Departure
              </label>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="date"
                  value={formData.departureDate}
                  onChange={(e) => handleInputChange('departureDate', e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <input
                  type="time"
                  value={formData.departureTime}
                  onChange={(e) => handleInputChange('departureTime', e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <AirportInput
                label="Origin Airport"
                value={formData.originAirport}
                onChange={(value) => handleInputChange('originAirport', value)}
                placeholder="e.g., JFK, New York"
              />
              <AirportInput
                label="Destination Airport"
                value={formData.destinationAirport}
                onChange={(value) => handleInputChange('destinationAirport', value)}
                placeholder="e.g., LAX, Los Angeles"
              />
            </div>
          </div>

          {/* Advanced Section */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm transition-colors"
            >
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showAdvanced ? 'Hide' : 'Show'} advanced factors (optional)
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Flight Duration
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={formData.duration}
                      onChange={(e) => handleInputChange('duration', e.target.value)}
                      placeholder="180"
                      min="0"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                      minutes
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Temperature
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={formData.temperature}
                      onChange={(e) => handleInputChange('temperature', e.target.value)}
                      placeholder="72"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                      °F
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Precipitation Type
                  </label>
                  <select
                    value={formData.precipitation}
                    onChange={(e) =>
                      handleInputChange('precipitation', e.target.value as FlightFormData['precipitation'])
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="none">None</option>
                    <option value="rain">Rain</option>
                    <option value="snow">Snow</option>
                    <option value="thunderstorms">Thunderstorms</option>
                    <option value="sleet">Sleet</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Wind Conditions
                  </label>
                  <select
                    value={formData.wind}
                    onChange={(e) =>
                      handleInputChange('wind', e.target.value as FlightFormData['wind'])
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="calm">Calm</option>
                    <option value="moderate">Moderate</option>
                    <option value="strong">Strong</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Predict Button */}
          <button
            onClick={handlePredict}
            disabled={!isFormValid || isLoading}
            className="mt-6 w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Analyzing...' : 'Predict Delay Probability'}
          </button>
          {error && (
            <p className="mt-3 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>

        {/* Result Panel */}
        <div className="lg:sticky lg:top-8 h-fit">
          <PredictionResult 
            prediction={prediction} 
            isLoading={isLoading}
            hasSubmitted={prediction !== null || isLoading}
          />
        </div>
      </div>
    </div>
  );
}
