import { useState, useRef, useEffect, type ChangeEvent } from 'react';
import { MapPin } from 'lucide-react';
import { AIRPORTS, findAirportByCode, getAirportDisplayLabel } from '@/lib/airports';

interface AirportInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function AirportInput({ label, value, onChange, placeholder }: AirportInputProps) {
  const [query, setQuery] = useState(value);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredAirports, setFilteredAirports] = useState(AIRPORTS);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const selectedAirport = findAirportByCode(value);
    setQuery(selectedAirport ? getAirportDisplayLabel(selectedAirport) : value);
  }, [value]);

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
        airport.name.toLowerCase().includes(inputValue.toLowerCase()) ||
        getAirportDisplayLabel(airport).toLowerCase().includes(inputValue.toLowerCase())
      );
      setFilteredAirports(filtered);
      setShowSuggestions(true);
    } else {
      setFilteredAirports(AIRPORTS);
      setShowSuggestions(false);
    }
  };

  const handleSelectAirport = (airport: typeof AIRPORTS[number]) => {
    setQuery(getAirportDisplayLabel(airport));
    onChange(airport.code);
    setShowSuggestions(false);
  };

  const handleBlur = () => {
    const selectedAirport = findAirportByCode(value);
    if (selectedAirport) {
      setQuery(getAirportDisplayLabel(selectedAirport));
      onChange(selectedAirport.code);
    }
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
          value={query}
          onChange={(event: ChangeEvent<HTMLInputElement>) => handleInputChange(event.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {showSuggestions && filteredAirports.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
          {filteredAirports.slice(0, 8).map((airport) => (
            <button
              key={airport.code}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => handleSelectAirport(airport)}
              className="w-full px-4 py-2.5 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
            >
              <div className="font-medium text-gray-900">
                {getAirportDisplayLabel(airport)}
              </div>
              <div className="text-sm text-gray-600">{airport.name}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
