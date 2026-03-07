import { useState } from 'react';
import { AirportInput } from './AirportInput';
import { PredictionResult } from './PredictionResult';
import { ChevronDown, ChevronUp, Plane } from 'lucide-react';

interface FlightData {
  departureDate: string;
  departureTime: string;
  originAirport: string;
  destinationAirport: string;
  duration: string;
  temperature: string;
  precipitation: string;
  wind: string;
}

interface PredictionData {
  probability: number;
  riskLevel: 'low' | 'moderate' | 'high';
  explanation: string;
}

export function FlightDelayPredictor() {
  const [formData, setFormData] = useState<FlightData>({
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
  const [prediction, setPrediction] = useState<PredictionData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (field: keyof FlightData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePredict = () => {
    setIsLoading(true);
    
    // Simulate API call with mock prediction
    setTimeout(() => {
      const mockPrediction = generateMockPrediction(formData);
      setPrediction(mockPrediction);
      setIsLoading(false);
    }, 1200);
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
                    onChange={(e) => handleInputChange('precipitation', e.target.value)}
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
                    onChange={(e) => handleInputChange('wind', e.target.value)}
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

function generateMockPrediction(data: FlightData): PredictionData {
  // Mock logic based on inputs
  let probability = 25;
  const factors: string[] = [];

  // Weather impact
  if (data.precipitation === 'snow') {
    probability += 35;
    factors.push('winter weather conditions');
  } else if (data.precipitation === 'thunderstorms') {
    probability += 30;
    factors.push('severe weather');
  } else if (data.precipitation === 'rain') {
    probability += 15;
    factors.push('rain conditions');
  }

  if (data.wind === 'strong') {
    probability += 20;
    factors.push('strong winds');
  } else if (data.wind === 'moderate') {
    probability += 10;
  }

  // Time-based factors
  if (data.departureTime) {
    const hour = parseInt(data.departureTime.split(':')[0]);
    if (hour >= 6 && hour <= 9) {
      probability += 12;
      factors.push('morning rush hour');
    } else if (hour >= 17 && hour <= 20) {
      probability += 15;
      factors.push('evening peak hours');
    }
  }

  // Duration impact
  const duration = parseInt(data.duration);
  if (duration > 300) {
    probability += 8;
    factors.push('long-haul flight');
  }

  // Cap probability
  probability = Math.min(95, Math.max(5, probability));

  // Determine risk level
  let riskLevel: 'low' | 'moderate' | 'high';
  if (probability < 30) riskLevel = 'low';
  else if (probability < 70) riskLevel = 'moderate';
  else riskLevel = 'high';

  // Generate explanation
  let explanation = '';
  if (factors.length > 0) {
    explanation = `Based on the flight details, there's a ${riskLevel} delay risk due to ${factors.join(', ')}. `;
  } else {
    explanation = `Based on the flight details, conditions appear favorable. `;
  }

  if (riskLevel === 'low') {
    explanation += `The ${data.originAirport} to ${data.destinationAirport} route generally maintains good on-time performance under these conditions. Consider arriving at the recommended time before departure.`;
  } else if (riskLevel === 'moderate') {
    explanation += `The combination of route characteristics and current conditions suggests some delay potential. We recommend monitoring your flight status closely and allowing extra time for connections.`;
  } else {
    explanation += `Multiple factors indicate elevated delay risk for this flight. Consider backup plans for tight connections and check with your airline for real-time updates.`;
  }

  return { probability, riskLevel, explanation };
}