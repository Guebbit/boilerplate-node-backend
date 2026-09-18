/**
 * @module
 * Turns the shared HTTP counters and duration histogram (`infrastructure/observability/metrics-http`)
 * into the numbers `GET /observability/metrics/overview` and the SSE stream publish: totals,
 * summed across every method/route series, and the two latency percentiles this in-app view
 * approximates from Prometheus histogram buckets.
 *
 * See: docs/tools/opentelemetry.md
 */

import {
    httpRequestsTotal,
    httpRequestErrorsTotal,
    httpRequestDuration
} from '@infrastructure/observability/metrics-http';

/**
 * Sum raw metric sample values from a prom-client get() result. A metric's `get()` returns one
 * entry per label combination, so totalling across every series is the only way to get one
 * overall number.
 */
const sumMetricValues = (values: { value: number }[]) =>
    values.reduce((sum, value) => sum + value.value, 0);

/** One histogram bucket: its upper bound and the *cumulative* count at or below it. */
interface LatencyBucket {
    upperBound: number;
    /** Cumulative, not per-bucket — Prometheus histograms are cumulative by definition. */
    cumulativeCount: number;
}

/**
 * Collapse histogram values into per-boundary bucket totals.
 * prom-client histogram get() mixes _sum/_count rows (metricName set) with bucket rows — skip the former.
 * The +Inf bucket gives the total request count.
 */
const aggregateLatencyBuckets = (
    values: {
        value: number;
        labels: Record<string, string | number | undefined>;
        metricName?: string;
    }[]
): { buckets: LatencyBucket[]; totalCount: number } => {
    // Keyed by bucket boundary, summing across every method/route series — the goal is one
    // service-wide latency distribution, not a per-route one.
    const totals = new Map<number, number>();
    let totalCount = 0;

    for (const { value, labels, metricName } of values) {
        // prom-client sets `metricName` only on the derived `_sum` and `_count` rows; bucket
        // rows leave it undefined. Including them would inflate the counts badly.
        if (metricName) continue;
        // `le` ("less than or equal") is the standard Prometheus bucket-boundary label.
        const { le } = labels;
        if (le === undefined) continue;
        // The `+Inf` bucket counts *every* observation, so it is the total sample count.
        if (le === '+Inf') {
            totalCount += value;
            continue;
        }

        const boundary = Number(le);
        totals.set(boundary, (totals.get(boundary) ?? 0) + value);
    }

    // Ascending order is required by the percentile scan below, which relies on cumulative
    // counts increasing monotonically. `toSorted` copies rather than mutating in place.
    const buckets = [...totals.entries()]
        .toSorted(([a], [b]) => a - b)
        .map(([upperBound, cumulativeCount]) => ({ upperBound, cumulativeCount }));

    return { buckets, totalCount };
};

/**
 * Estimate a percentile from cumulative histogram buckets. Walks up the buckets and returns the
 * first boundary whose cumulative count reaches the target rank.
 *
 * The result is always a bucket *boundary*, so it over-estimates within the bucket — a true p95
 * of 60ms reports as 100ms here. Real Prometheus interpolates (`histogram_quantile`); this is a
 * deliberately simpler approximation for the in-app overview endpoint.
 *
 * @param percentile - fraction in [0, 1], e.g. 0.95
 */
export const percentileFromHistogramBuckets = (
    buckets: LatencyBucket[],
    totalCount: number,
    percentile: number
): number => {
    // No data yet (fresh process) — report 0 rather than NaN, which would break dashboards.
    if (totalCount <= 0 || buckets.length === 0) return 0;

    // Rank of the target observation, e.g. the 95th out of 100.
    const threshold = totalCount * percentile;
    for (const { upperBound, cumulativeCount } of buckets) {
        if (cumulativeCount >= threshold) return upperBound;
    }

    // Fallthrough: the target rank sits in the `+Inf` bucket (i.e. slower than the largest
    // boundary), so report the highest finite bound as a floor on the true value.
    return buckets.at(-1)?.upperBound ?? 0;
};

/**
 * Read total request and error counters from prom-client in one call.
 * Async because prom-client metric reads return promises (a `collect()` hook may itself be async).
 * `Promise.all` reads both in parallel, so the two totals come from the same instant.
 */
export const getHttpRequestCounters = () =>
    Promise.all([httpRequestsTotal.get(), httpRequestErrorsTotal.get()]).then(
        ([requestMetrics, errorMetrics]) => ({
            totalRequests: sumMetricValues(requestMetrics.values),
            totalErrors: sumMetricValues(errorMetrics.values)
        })
    );

/**
 * Estimate p50 and p95 latency (ms) from the request-duration histogram buckets. Percentiles
 * rather than an average, because an average hides the tail: p95 is what the unluckiest 5% of
 * users experience.
 *
 * Computed over the *entire process lifetime*, not a recent window, so a spike gets diluted over
 * time — for time-windowed values, query the scraped histogram with `histogram_quantile` instead.
 */
export const getLatencyPercentiles = (): Promise<{ p50: number; p95: number }> =>
    httpRequestDuration.get().then(({ values }) => {
        const { buckets, totalCount } = aggregateLatencyBuckets(values);
        return {
            // Median — the typical request.
            p50: percentileFromHistogramBuckets(buckets, totalCount, 0.5),
            // Tail — the usual SLO target.
            p95: percentileFromHistogramBuckets(buckets, totalCount, 0.95)
        };
    });
