/**
 * @module
 * Calendar days, with no clock and no zone: a day is three numbers. The zone only enters when a
 * day becomes an instant (`services/range.ts`), so every rule here is plain arithmetic a table of
 * cases can cover.
 */

import { DAY_MS } from '@domain-primitives/time';

/** A calendar day as the shop's wall calendar shows it. `month` is 1-12. */
export interface CalendarDay {
    year: number;
    month: number;
    day: number;
}

/** The bucket sizes a report may ask for. */
export type CalendarInterval = 'day' | 'week' | 'month';

/**
 * A calendar day as a UTC timestamp at midnight — the one representation arithmetic is done in.
 * @param day - the calendar day
 */
const toUtc = ({ year, month, day }: CalendarDay): number => Date.UTC(year, month - 1, day);

/**
 * The calendar day a UTC timestamp falls on.
 * @param timestamp - a UTC timestamp
 */
const fromUtc = (timestamp: number): CalendarDay => {
    const date = new Date(timestamp);
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
};

/** `YYYY-MM-DD`, the only spelling accepted. */
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Read `YYYY-MM-DD` as a calendar day.
 * @param text - the text
 * @returns the day, or `undefined` when it is not a real calendar date (`2026-02-30`)
 */
export const parseDay = (text: string): CalendarDay | undefined => {
    const match = ISO_DAY.exec(text);
    if (!match) return undefined;
    const parsed: CalendarDay = {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3])
    };
    // A round trip through `Date` is what refuses a day the month does not have.
    const roundTrip = fromUtc(toUtc(parsed));
    return roundTrip.year === parsed.year &&
        roundTrip.month === parsed.month &&
        roundTrip.day === parsed.day
        ? parsed
        : undefined;
};

/**
 * Write a calendar day as `YYYY-MM-DD`.
 * @param day - the calendar day
 */
export const formatDay = ({ year, month, day }: CalendarDay): string =>
    `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/**
 * Move a day by whole days, either way.
 * @param day - where to start
 * @param amount - how many days; negative goes back
 */
export const addDays = (day: CalendarDay, amount: number): CalendarDay =>
    fromUtc(toUtc(day) + amount * DAY_MS);

/**
 * Whole days from `from` to `to`, counted inclusively at both ends.
 * @param from - the first day
 * @param to - the last day
 * @returns the count; 0 or less when `to` is before `from`
 */
export const inclusiveDays = (from: CalendarDay, to: CalendarDay): number =>
    Math.round((toUtc(to) - toUtc(from)) / DAY_MS) + 1;

/**
 * The first day of the bucket a day belongs to: the day itself, the Monday on or before it, or the
 * first of its month.
 * @param day - any day
 * @param interval - the bucket size
 */
export const bucketStart = (day: CalendarDay, interval: CalendarInterval): CalendarDay => {
    if (interval === 'day') return day;
    if (interval === 'month') return { ...day, day: 1 };
    // getUTCDay: 0 is Sunday; a Monday-first week puts Sunday last.
    const sinceMonday = (new Date(toUtc(day)).getUTCDay() + 6) % 7;
    return addDays(day, -sinceMonday);
};

/**
 * The first day of the bucket after the one starting at `start`.
 * @param start - a day {@link bucketStart} returned
 * @param interval - the bucket size
 */
export const nextBucket = (start: CalendarDay, interval: CalendarInterval): CalendarDay => {
    if (interval === 'day') return addDays(start, 1);
    if (interval === 'week') return addDays(start, 7);
    return start.month === 12
        ? { year: start.year + 1, month: 1, day: 1 }
        : { year: start.year, month: start.month + 1, day: 1 };
};
