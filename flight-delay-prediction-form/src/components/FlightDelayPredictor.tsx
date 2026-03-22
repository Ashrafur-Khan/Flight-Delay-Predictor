import { useState } from 'react';
import { AirportInput } from './AirportInput';
import { PredictionResult } from './PredictionResult';
import { ChevronDown, ChevronUp, Plane, Plus, X } from 'lucide-react';
import type { FlightFormData, PredictionResponse } from '@/types';
import { submitPrediction } from '@/services/prediction';

const formatStopLabel = (value: string, fallback: string) => value.trim() || fallback;

export function FlightDelayPredictor() {
  const [formData, setFormData] = useState<FlightFormData>({
    departureDate: '',
    departureTime: '',
    originAirport: '',
    destinationAirport: '',
    connections: [],
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

  const handleAddConnection = () => {
    setFormData(prev => ({
      ...prev,
      connections: [...prev.connections, '']
    }));
  };

  const handleRemoveConnection = (index: number) => {
    setFormData(prev => ({
      ...prev,
      connections: prev.connections.filter((_, i) => i !== index)
    }));
  };

  const handleConnectionChange = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      connections: prev.connections.map((airport, i) =>
        i === index ? value : airport
      )
    }));
  };

  const handlePredict = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await submitPrediction(formData);
      setPrediction(result);
    } catch (predictionError) {
      console.error('Prediction request failed', predictionError);
      setError(
        'Unable to fetch a prediction right now. Please try again shortly.',
      );
      setPrediction(null);
    } finally {
      setIsLoading(false);
    }
  };

  const isFormValid = formData.departureDate && 
                       formData.departureTime && 
                       formData.originAirport && 
                       formData.destinationAirport;
  const routeStops = [
    { label: 'Origin', value: formData.originAirport, fallback: 'Select origin' },
    ...formData.connections.map((connection, index) => ({
      label: `Layover ${index + 1}`,
      value: connection,
      fallback: 'Add layover',
    })),
    { label: 'Destination', value: formData.destinationAirport, fallback: 'Select destination' },
  ];

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

            {/* Connecting Flights Section */}
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/80 p-4">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-900">
                    Connecting Flights
                  </label>
                  <p className="max-w-xl text-sm text-gray-600">
                    Add layovers in itinerary order. After prediction, each leg and the full itinerary will get a frontend-only score.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleAddConnection}
                  className="inline-flex items-center gap-2 self-start rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-blue-300 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Connection
                </button>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                <div className="space-y-3">
                  {routeStops.map((stop, index) => (
                    <div key={`${stop.label}-${index}`} className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <div className="mt-1 h-2.5 w-2.5 rounded-full bg-blue-500" />
                        {index < routeStops.length - 1 && <div className="mt-2 h-8 w-px bg-gray-200" />}
                      </div>
                      <div className="min-w-0 flex-1 pb-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                          {stop.label}
                        </p>
                        <p className="truncate text-sm text-gray-900">
                          {formatStopLabel(stop.value, stop.fallback)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {formData.connections.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {formData.connections.map((connection, index) => (
                    <div key={index} className="rounded-lg border border-gray-200 bg-white p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Layover {index + 1}</p>
                          <p className="text-xs text-gray-500">Airport for the next stop in the itinerary</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveConnection(index)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                          aria-label={`Remove connection ${index + 1}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      <AirportInput
                        label="Layover Airport"
                        value={connection}
                        onChange={(value) => handleConnectionChange(index, value)}
                        placeholder="e.g., ORD, Chicago"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-gray-500">
                  No layovers added. Keep this empty for a direct route.
                </p>
              )}
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
                      handleInputChange(
                        'precipitation',
                        e.target.value as FlightFormData['precipitation'],
                      )
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
                      handleInputChange(
                        'wind',
                        e.target.value as FlightFormData['wind'],
                      )
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
