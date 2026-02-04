import { addUtcMonths } from './addUtcMonths';

describe('addUtcMonths', () => {
  it('adds months preserving UTC time components', () => {
    const date = new Date(Date.UTC(2023, 0, 15, 12, 34, 56, 789));
    expect(addUtcMonths(date, 2).toISOString()).toBe('2023-03-15T12:34:56.789Z');
  });

  it('clamps day-of-month when target month is shorter (non-leap year)', () => {
    const date = new Date(Date.UTC(2023, 0, 31, 23, 59, 59, 123));
    expect(addUtcMonths(date, 1).toISOString()).toBe('2023-02-28T23:59:59.123Z');
  });

  it('clamps day-of-month when target month is shorter (leap year)', () => {
    const date = new Date(Date.UTC(2024, 0, 31, 23, 59, 59, 123));
    expect(addUtcMonths(date, 1).toISOString()).toBe('2024-02-29T23:59:59.123Z');
  });

  it('supports subtracting months across year boundaries', () => {
    const date = new Date(Date.UTC(2024, 0, 15, 0, 0, 0, 0));
    expect(addUtcMonths(date, -2).toISOString()).toBe('2023-11-15T00:00:00.000Z');
  });

  it('accepts ISO string input', () => {
    expect(addUtcMonths('2023-01-31T12:00:00.000Z', 1).toISOString()).toBe(
      '2023-02-28T12:00:00.000Z'
    );
  });

  it('throws for invalid ISO string input', () => {
    expect(() => addUtcMonths('not-an-iso', 1)).toThrow('Invalid ISO timestamp: not-an-iso');
  });

  it('throws for non-integer months', () => {
    expect(() => addUtcMonths(new Date(Date.UTC(2023, 0, 1)), 1.5)).toThrow(
      'months must be a finite whole number'
    );
  });
});
