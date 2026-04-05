import { describe, expect, it } from 'vitest';
import type { FlightFormData } from '../src/types';
import { validateFlightForm } from '../src/services/prediction';

const buildFormData = (overrides: Partial<FlightFormData> = {}): FlightFormData => ({
  departureDate: '2026-05-15',
  departureTime: '08:30',
  originAirport: 'LAX',
  destinationAirport: 'JFK',
  connections: [],
  temperature: '',
  precipitation: 'none',
  wind: 'calm',
  ...overrides,
});

describe('validateFlightForm', () => {
  it('allows a blank optional temperature', () => {
    const result = validateFlightForm(buildFormData());

    expect(result.blockingIssues).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('accepts boundary temperatures', () => {
    expect(validateFlightForm(buildFormData({ temperature: '-80' })).blockingIssues).toHaveLength(0);
    expect(validateFlightForm(buildFormData({ temperature: '140' })).blockingIssues).toHaveLength(0);
  });

  it('rejects out-of-range temperatures', () => {
    expect(validateFlightForm(buildFormData({ temperature: '-81' })).blockingIssues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'invalid_temperature' })]),
    );
    expect(validateFlightForm(buildFormData({ temperature: '141' })).blockingIssues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'invalid_temperature' })]),
    );
  });

  it('rejects malformed temperatures', () => {
    for (const temperature of ['72.5', '1e3']) {
      expect(validateFlightForm(buildFormData({ temperature })).blockingIssues).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'invalid_temperature' })]),
      );
    }

    expect(validateFlightForm(buildFormData({ temperature: '   ' })).blockingIssues).toHaveLength(0);
  });

  it('accepts airports that resolve from supported inputs', () => {
    const result = validateFlightForm(buildFormData({
      originAirport: 'lax - los angeles',
      destinationAirport: 'New York',
      connections: ['Chicago'],
    }));

    expect(result.blockingIssues).toHaveLength(0);
  });

  it('rejects unknown airports across route fields', () => {
    const result = validateFlightForm(buildFormData({
      originAirport: 'ZZZ',
      destinationAirport: 'QQQ',
      connections: ['ABC'],
    }));

    expect(result.blockingIssues.filter((issue) => issue.code === 'invalid_airport')).toHaveLength(3);
  });

  it('blocks blank layovers', () => {
    const result = validateFlightForm(buildFormData({
      connections: [''],
    }));

    expect(result.blockingIssues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'blank_layover' })]),
    );
  });

  it('rejects same-airport direct routes', () => {
    const result = validateFlightForm(buildFormData({
      originAirport: 'LAX',
      destinationAirport: 'LAX',
    }));

    expect(result.blockingIssues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'same_origin_destination' })]),
    );
  });

  it('allows looped itineraries when each segment is possible', () => {
    const result = validateFlightForm(buildFormData({
      originAirport: 'LAX',
      destinationAirport: 'LAX',
      connections: ['JFK'],
    }));

    expect(result.blockingIssues).toHaveLength(0);
  });

  it('rejects duplicate consecutive stops', () => {
    const result = validateFlightForm(buildFormData({
      originAirport: 'LAX',
      destinationAirport: 'JFK',
      connections: ['LAX'],
    }));

    expect(result.blockingIssues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'duplicate_consecutive_stop' })]),
    );
  });

  it('emits warning-only weather mismatches', () => {
    const result = validateFlightForm(buildFormData({
      temperature: '45',
      precipitation: 'snow',
    }));

    expect(result.blockingIssues).toHaveLength(0);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'weather_mismatch' })]),
    );
  });
});
