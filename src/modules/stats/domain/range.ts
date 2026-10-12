/**
 * @module
 * Which periods a report may ask for. Pure: the bounds are counted in calendar days, so the rule
 * is the same in every zone.
 */

import {
    addDays,
    bucketStart,
    inclusiveDays,
    nextBucket,
    parseDay,
    type CalendarDay,
    type CalendarInterval
} from './calendar';

/** The longest period one request may cover, two years of days. */
export const MAX_RANGE_DAYS = 731;

/** The most buckets one request may return, so a day-by-day chart of two years is refused. */
export const MAX_BUCKETS = 400;

/** Why a period was refused. */
export type RangeRefusal = 'invalid-day' | 'out-of-order' | 'too-long' | 'too-many-buckets';

/** A period that passed the rules, as calendar days. */
export interface CalendarRange {
    from: CalendarDay;
    to: CalendarDay;
    interval: CalendarInterval;
    /** The first day of every bucket the period touches, the first one possibly before `from`. */
    bucketStarts: CalendarDay[];
}

/**
 * The first day of every bucket between two days.
 * @param from - the first day of the period
 * @param to - the last day of the period
 * @param interval - the bucket size
 */
export const bucketStartsBetween = (
    from: CalendarDay,
    to: CalendarDay,
    interval: CalendarInterval
): CalendarDay[] => {
    const starts: CalendarDay[] = [];
    let cursor = bucketStart(from, interval);
    while (inclusiveDays(cursor, to) > 0) {
        starts.push(cursor);
        cursor = nextBucket(cursor, interval);
    }
    return starts;
};

/**
 * Check a requested period against the rules.
 * @param input - the two days as `YYYY-MM-DD` text, and the bucket size
 * @returns the range, or why it was refused
 */
export const checkRange = (input: {
    from: string;
    to: string;
    interval: CalendarInterval;
}): { range: CalendarRange } | { refusal: RangeRefusal } => {
    const from = parseDay(input.from);
    const to = parseDay(input.to);
    if (!from || !to) return { refusal: 'invalid-day' };
    const days = inclusiveDays(from, to);
    if (days < 1) return { refusal: 'out-of-order' };
    if (days > MAX_RANGE_DAYS) return { refusal: 'too-long' };
    const bucketStarts = bucketStartsBetween(from, to, input.interval);
    if (bucketStarts.length > MAX_BUCKETS) return { refusal: 'too-many-buckets' };
    return { range: { from, to, interval: input.interval, bucketStarts } };
};

/**
 * The period of equal length that ends the day before `range` starts.
 * @param range - the requested period
 */
export const previousOf = (range: CalendarRange): { from: CalendarDay; to: CalendarDay } => {
    const days = inclusiveDays(range.from, range.to);
    const to = addDays(range.from, -1);
    return { from: addDays(to, 1 - days), to };
};
