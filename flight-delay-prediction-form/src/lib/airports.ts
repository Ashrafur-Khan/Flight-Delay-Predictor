import type { Airport } from '@/types';

export const AIRPORTS: Airport[] = [
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

export const getAirportDisplayLabel = (airport: Airport) => `${airport.code} - ${airport.city}`;

export const findAirportByCode = (value: string) =>
  AIRPORTS.find(airport => airport.code === value.trim().toUpperCase());

export const normalizeAirportCode = (value: string): string => {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  const codePrefixMatch = trimmed.match(/^([A-Za-z]{3})(?:\b|\s*-|$)/);
  if (codePrefixMatch?.[1]) {
    return codePrefixMatch[1].toUpperCase();
  }

  const lowerValue = trimmed.toLowerCase();
  const knownAirport = AIRPORTS.find(airport => {
    const displayLabel = getAirportDisplayLabel(airport).toLowerCase();
    return (
      lowerValue === airport.code.toLowerCase()
      || lowerValue === airport.city.toLowerCase()
      || lowerValue === airport.name.toLowerCase()
      || lowerValue === displayLabel
    );
  });

  return knownAirport?.code ?? trimmed.toUpperCase();
};
