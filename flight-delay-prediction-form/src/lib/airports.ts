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
  { code: 'CLT', name: 'Charlotte Douglas International', city: 'Charlotte' },
  { code: 'PHX', name: 'Phoenix Sky Harbor International', city: 'Phoenix' },
  { code: 'IAH', name: 'George Bush Intercontinental', city: 'Houston' },
  { code: 'MIA', name: 'Miami International', city: 'Miami' },
  { code: 'BOS', name: 'Logan International', city: 'Boston' },
  { code: 'EWR', name: 'Newark Liberty International', city: 'Newark' },
  { code: 'MSP', name: 'Minneapolis-St Paul International', city: 'Minneapolis' },
  { code: 'DTW', name: 'Detroit Metropolitan Wayne County', city: 'Detroit' },
  { code: 'PHL', name: 'Philadelphia International', city: 'Philadelphia' },
  { code: 'LGA', name: 'LaGuardia', city: 'New York' },
  { code: 'BWI', name: 'Baltimore/Washington International', city: 'Baltimore' },
  { code: 'DCA', name: 'Ronald Reagan Washington National', city: 'Washington D.C.' },
  { code: 'IAD', name: 'Washington Dulles International', city: 'Washington D.C.' },
  { code: 'SLC', name: 'Salt Lake City International', city: 'Salt Lake City' },
  { code: 'SAN', name: 'San Diego International', city: 'San Diego' },
  { code: 'FLL', name: 'Fort Lauderdale-Hollywood International', city: 'Fort Lauderdale' },
  { code: 'BNA', name: 'Nashville International', city: 'Nashville' },
  { code: 'MDW', name: 'Chicago Midway International', city: 'Chicago' },
  { code: 'TPA', name: 'Tampa International', city: 'Tampa' },
  { code: 'AUS', name: 'Austin-Bergstrom International', city: 'Austin' },
  { code: 'DAL', name: 'Dallas Love Field', city: 'Dallas' },
  { code: 'PDX', name: 'Portland International', city: 'Portland' },
  { code: 'STL', name: 'St. Louis Lambert International', city: 'St. Louis' },
  { code: 'HOU', name: 'William P. Hobby', city: 'Houston' },
  { code: 'RDU', name: 'Raleigh-Durham International', city: 'Raleigh' },
  { code: 'HNL', name: 'Daniel K. Inouye International', city: 'Honolulu' },
  { code: 'SJC', name: 'Norman Y. Mineta San Jose International', city: 'San Jose' },
  { code: 'SMF', name: 'Sacramento International', city: 'Sacramento' },
  { code: 'MSY', name: 'Louis Armstrong New Orleans International', city: 'New Orleans' },
  { code: 'MCI', name: 'Kansas City International', city: 'Kansas City' },
  { code: 'OAK', name: 'Oakland International', city: 'Oakland' },
  { code: 'SNA', name: 'John Wayne Airport', city: 'Santa Ana' },
  { code: 'IND', name: 'Indianapolis International', city: 'Indianapolis' },
  { code: 'CLE', name: 'Cleveland-Hopkins International', city: 'Cleveland' },
  { code: 'PIT', name: 'Pittsburgh International', city: 'Pittsburgh' },
  { code: 'CMH', name: 'John Glenn Columbus International', city: 'Columbus' },
  { code: 'CVG', name: 'Cincinnati/Northern Kentucky International', city: 'Cincinnati' },
  { code: 'SAT', name: 'San Antonio International', city: 'San Antonio' },
  { code: 'RSW', name: 'Southwest Florida International', city: 'Fort Myers' },
  { code: 'MKE', name: 'General Mitchell International', city: 'Milwaukee' },
  { code: 'SJU', name: 'Luis Munoz Marin International', city: 'San Juan' },
  { code: 'BUR', name: 'Bob Hope Airport', city: 'Burbank' },
  { code: 'JAX', name: 'Jacksonville International', city: 'Jacksonville' },
  { code: 'PBI', name: 'Palm Beach International', city: 'West Palm Beach' },
  { code: 'OGG', name: 'Kahului Airport', city: 'Kahului' },
  { code: 'BDL', name: 'Bradley International', city: 'Hartford' },
  { code: 'BOI', name: 'Boise Air Terminal', city: 'Boise' },
  { code: 'OMA', name: 'Eppley Airfield', city: 'Omaha' },
  { code: 'CHS', name: 'Charleston International', city: 'Charleston' },
  { code: 'ONT', name: 'Ontario International', city: 'Ontario' },
  { code: 'ABQ', name: 'Albuquerque International Sunport', city: 'Albuquerque' },
  { code: 'BUF', name: 'Buffalo Niagara International', city: 'Buffalo' },
  { code: 'RIC', name: 'Richmond International', city: 'Richmond' },
  { code: 'MEM', name: 'Memphis International', city: 'Memphis' },
  { code: 'SDF', name: 'Louisville Muhammad Ali International', city: 'Louisville' },
  { code: 'OKC', name: 'Will Rogers International', city: 'Oklahoma City' },
  { code: 'ORF', name: 'Norfolk International', city: 'Norfolk' },
  { code: 'RNO', name: 'Reno/Tahoe International', city: 'Reno' },
  { code: 'ANC', name: 'Ted Stevens Anchorage International', city: 'Anchorage' },
  { code: 'GEG', name: 'Spokane International', city: 'Spokane' },
  { code: 'TUS', name: 'Tucson International', city: 'Tucson' },
  { code: 'GRR', name: 'Gerald R. Ford International', city: 'Grand Rapids' },
  { code: 'BHM', name: 'Birmingham-Shuttlesworth International', city: 'Birmingham' },
  { code: 'TUL', name: 'Tulsa International', city: 'Tulsa' },
  { code: 'ELP', name: 'El Paso International', city: 'El Paso' },
  { code: 'SAV', name: 'Savannah/Hilton Head International', city: 'Savannah' },
  { code: 'PVD', name: 'Rhode Island T.F. Green International', city: 'Providence' },
  { code: 'TYS', name: 'McGhee Tyson', city: 'Knoxville' },
  { code: 'LGB', name: 'Long Beach Airport', city: 'Long Beach' },
  { code: 'KOA', name: 'Ellison Onizuka Kona International', city: 'Kona' },
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
