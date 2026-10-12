/**
 * @module
 * The pieces every grouped read behind the stats shares: a half-open window with a bucket size and
 * a zone, the `$dateTrunc` that buckets in that zone, and the Decimal128 sum that keeps money from
 * drifting. Not stats-specific — each owner module uses it for its own grouped read.
 *
 * Why Decimal128: summing stored doubles drifts (0.1 + 0.2); `$toDecimal` first, then one
 * conversion to minor units per currency in JS.
 */

/** The bucket sizes a grouped read may use. */
export type ReportInterval = 'day' | 'week' | 'month';

/** What a grouped read is asked about: a half-open instant window, and how to bucket it. */
export interface ReportWindow {
    /** First instant included. */
    from: Date;
    /** First instant excluded. */
    to: Date;
    /** The bucket size. */
    interval: ReportInterval;
    /** IANA zone the buckets are cut in; a bucket starts at local midnight there. */
    timeZone: string;
}

/**
 * The `$dateTrunc` expression that puts a date field into its bucket, in the window's zone.
 * https://www.mongodb.com/docs/manual/reference/operator/aggregation/dateTrunc/
 *
 * `startOfWeek` is Monday, and only means anything for `week`, so it is only sent then.
 *
 * @param field - the date field, with its `$`
 * @param window - the window being read
 */
export const bucketOf = (field: string, { interval, timeZone }: ReportWindow) => ({
    $dateTrunc: {
        date: field,
        unit: interval,
        timezone: timeZone,
        ...(interval === 'week' ? { startOfWeek: 'monday' } : {})
    }
});

/**
 * A Mongo sum of one numeric expression, kept in Decimal128 so cents add exactly.
 * @param expression - a field (`'$netTotal'`) or an expression already yielding a number
 */
export const decimalSum = (expression: unknown) => ({ $sum: { $toDecimal: expression } });

/**
 * A number out of what a `$sum` of decimals returned.
 *
 * The driver answers a `Decimal128`, whose `toString` is the exact decimal; a plain number passes
 * through. Read by text rather than by `instanceof`, so it does not depend on which copy of the
 * BSON library built the value.
 *
 * @param value - what the aggregation returned for the sum
 * @returns the value; 0 for anything that is not a number
 */
export const numberOf = (value: unknown): number => {
    const parsed = typeof value === 'number' ? value : Number(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
};
