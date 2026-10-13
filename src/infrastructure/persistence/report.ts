/**
 * @module
 * The pieces every grouped read behind the stats shares: a half-open window with a bucket size and
 * a zone, and the `$dateTrunc` that buckets in that zone. Not stats-specific — each owner module
 * uses it for its own grouped read.
 *
 * Money is stored as Decimal128, so a plain `$sum` of it is exact; the result is read once, as
 * minor units per currency, by `toMinorUnits` (`@shared-kernel/money`).
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
