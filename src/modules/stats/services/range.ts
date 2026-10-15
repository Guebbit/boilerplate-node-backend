/**
 * @module
 * Turning a requested period into what the owners are asked: shop-local midnights as instants, and
 * every bucket start to fill the empty ones with. The zone is the shop's (`NODE_SHOP_TIMEZONE`), the
 * same one `$dateTrunc` buckets in, so a bucket edge and a bound can never disagree about a day.
 */

import { zonedStartOfDay } from '@modules/orders';
import type { ReportWindow } from '@infrastructure/persistence/report';
import { addDays, formatDay, type CalendarDay, type CalendarInterval } from '../domain/calendar';
import { checkRange, previousOf, type RangeRefusal } from '../domain/range';
import { shopTimezone } from '@modules/shop';

/** A period the owners can be asked about. */
export interface Period {
    /** The requested days, as the contract echoes them. */
    echo: { from: string; to: string; interval: CalendarInterval; timeZone: string };
    /** The half-open instant window of the period. */
    window: ReportWindow;
    /** The equal-length window just before, for the "vs previous" figures. */
    previous: ReportWindow;
    /** The instant every bucket starts at, empty ones included. */
    bucketStarts: Date[];
}

/**
 * A calendar day as the instant its shop-local day starts.
 * @param day - the calendar day
 * @param timeZone - the shop's zone
 */
const startOf = (day: CalendarDay, timeZone: string): Date =>
    zonedStartOfDay(day.year, day.month, day.day, timeZone);

/**
 * The half-open window covering two calendar days, both inclusive.
 * @param range - the first and last day
 * @param interval - the bucket size the owners group by
 * @param timeZone - the shop's zone
 */
const windowOf = (
    range: { from: CalendarDay; to: CalendarDay },
    interval: CalendarInterval,
    timeZone: string
): ReportWindow => ({
    from: startOf(range.from, timeZone),
    to: startOf(addDays(range.to, 1), timeZone),
    interval,
    timeZone
});

/**
 * Check a request and resolve it against the shop's zone.
 *
 * @param query - `from`/`to` as `YYYY-MM-DD`, and the bucket size (days when absent)
 * @returns the period, or why it was refused
 */
export const resolvePeriod = (query: {
    from: string;
    to: string;
    interval?: CalendarInterval | undefined;
}): { period: Period } | { refusal: RangeRefusal } => {
    const interval = query.interval ?? 'day';
    const checked = checkRange({ from: query.from, to: query.to, interval });
    if ('refusal' in checked) return checked;

    const { range } = checked;
    const timeZone = shopTimezone();
    return {
        period: {
            echo: { from: formatDay(range.from), to: formatDay(range.to), interval, timeZone },
            window: windowOf(range, interval, timeZone),
            // The previous period is only ever summed, so one coarse bucket per month is enough.
            previous: windowOf(previousOf(range), 'month', timeZone),
            bucketStarts: range.bucketStarts.map((day) => startOf(day, timeZone))
        }
    };
};
