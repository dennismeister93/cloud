/**
 * Add whole months to a date using UTC calendar math.
 *
 * - Preserves the UTC time-of-day components.
 * - Clamps the day-of-month to the last day of the target month.
 *
 * Accepts either a `Date` or an ISO timestamp string.
 */
export function addUtcMonths(input: Date | string, months: number): Date {
  if (!Number.isFinite(months) || !Number.isInteger(months)) {
    throw new Error(`months must be a finite whole number (got ${String(months)})`);
  }

  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) {
    if (typeof input === 'string') {
      throw new Error(`Invalid ISO timestamp: ${input}`);
    }
    throw new Error('Invalid Date');
  }

  const year = date.getUTCFullYear();
  const month0Based = date.getUTCMonth();
  const dayOfMonth = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  const millis = date.getUTCMilliseconds();

  const startTotalMonths = year * 12 + month0Based;
  const targetTotalMonths = startTotalMonths + months;

  let targetYear = Math.floor(targetTotalMonths / 12);
  let targetMonth0Based = targetTotalMonths % 12;
  if (targetMonth0Based < 0) {
    targetMonth0Based += 12;
    targetYear -= 1;
  }

  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth0Based + 1, 0)).getUTCDate();
  const clampedDayOfMonth = Math.min(dayOfMonth, daysInTargetMonth);

  return new Date(
    Date.UTC(targetYear, targetMonth0Based, clampedDayOfMonth, hours, minutes, seconds, millis)
  );
}
