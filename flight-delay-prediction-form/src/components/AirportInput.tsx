import { useState, useRef, useEffect, type ChangeEvent } from 'react';
import { MapPin } from 'lucide-react';
import type { Airport } from '@/types';

interface AirportInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

// Mock airport data
const AIRPORTS: Airport[] = [
  { code: 'JFK', name: 'John F. Kennedy International', city: 'New York' },
  { code: 'LAX', name: 'Los Angeles International', city: 'Los Angeles' },
  { code: 'ORD', name: "O'Hare International", city: 'Chicago' },
  { code: 'ATL', name: 'Hartsfield-Jackson Atlanta International', city: 'Atlanta' },
  { code: 'DFW', name: 'Dallas/Fort Worth International', city: 'Dallas' },
  { code: 'DEN', name: 'Denver International', city: 'Denver' },
  { code: 'SFO', name: 'San Francisco International', city: 'San Francisco' },
  { code: 'SEA', name: 'Seattle-Tacoma International', city: 'Seattle' },
  { code: 'LAS', name: 'Harry Reid International', city: 'Las Vegas' },
  { code: 'MCO', name: 'Orlando International', city: 'Orlando' },
  { code: 'MIA', name: 'Miami International', city: 'Miami' },
  { code: 'BOS', name: 'Logan International', city: 'Boston' },
  { code: 'EWR', name: 'Newark Liberty International', city: 'Newark' },
  { code: 'MSP', name: 'Minneapolis-St Paul International', city: 'Minneapolis' },
  { code: 'DTW', name: 'Detroit Metropolitan Wayne County', city: 'Detroit' },
  { code: 'PHL', name: 'Philadelphia International', city: 'Philadelphia' },
  { code: 'LGA', name: 'LaGuardia', city: 'New York' },
  { code: 'BWI', name: 'Baltimore/Washington International', city: 'Baltimore' },
  { code: 'IAD', name: 'Washington Dulles International', city: 'Washington D.C.' },
  { code: 'SAN', name: 'San Diego International', city: 'San Diego' },
];

export function AirportInput({ label, value, onChange, placeholder }: AirportInputProps) {
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredAirports, setFilteredAirports] = useState(AIRPORTS);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (inputValue: string) => {
    setQuery(inputValue);
    onChange(inputValue);
    
    if (inputValue.trim()) {
      const filtered = AIRPORTS.filter(airport => 
        airport.code.toLowerCase().includes(inputValue.toLowerCase()) ||
        airport.city.toLowerCase().includes(inputValue.toLowerCase()) ||
        airport.name.toLowerCase().includes(inputValue.toLowerCase())
      );
      setFilteredAirports(filtered);
      setShowSuggestions(true);
    } else {
      setFilteredAirports(AIRPORTS);
      setShowSuggestions(false);
    }
  };

  const handleSelectAirport = (airport: Airport) => {
    const displayValue = `${airport.code} - ${airport.city}`;
    setQuery(displayValue);
    onChange(displayValue);
    setShowSuggestions(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={value}
          onChange={(event: ChangeEvent<HTMLInputElement>) => handleInputChange(event.target.value)}
          onFocus={() => setShowSuggestions(true)}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {showSuggestions && filteredAirports.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
          {filteredAirports.slice(0, 8).map((airport) => (
            <button
              key={airport.code}
              onClick={() => handleSelectAirport(airport)}
              className="w-full px-4 py-2.5 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
            >
              <div className="font-medium text-gray-900">
                {airport.code} - {airport.city}
              </div>
              <div className="text-sm text-gray-600">{airport.name}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
