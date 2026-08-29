/**
 * Database query counters (Prometheus), read by name from `GET /observability/metrics/overview`
 * the same way the domain counters in `modules/*\/metrics.ts` are — see `readCounter` there.
 */

import { Counter } from 'prom-client';
import { metricsRegistry } from '@infrastructure/observability/metrics-http';

/** Every call `createBaseRepository`'s factory methods make to Mongoose. */
export const databaseQueriesTotal = new Counter({
    name: 'db_queries_total',
    help: 'Total number of database queries executed.',
    registers: [metricsRegistry]
});

/** The subset of `databaseQueriesTotal` that rejected. */
export const databaseErrorsTotal = new Counter({
    name: 'db_errors_total',
    help: 'Total number of database queries that failed.',
    registers: [metricsRegistry]
});

/**
 * Wrap a repository method so every call counts as a query, and every rejection also counts as
 * an error — the two totals `get-observability-metrics-overview.ts` reports.
 */
export const trackDatabaseQuery =
    <TArguments extends unknown[], TResult>(
        function_: (...arguments_: TArguments) => Promise<TResult>
    ) =>
    (...arguments_: TArguments): Promise<TResult> => {
        databaseQueriesTotal.inc();
        return function_(...arguments_).catch((error: unknown) => {
            databaseErrorsTotal.inc();
            throw error;
        });
    };
