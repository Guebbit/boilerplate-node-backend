/**
 * @module
 * The schema of `shared/rules/metrics.yaml`: name, kind, help, labels and buckets of every
 * infrastructure metric. Dashboards and alert rules depend on the names, so they are data a twin
 * copies; recording and `collect()` hooks stay code.
 *
 * Relative imports only: see `src/infrastructure/config/shared-rules/load.ts`.
 */

import { z } from 'zod';

/** One metric's data. Strict: an extra key is a typo, or a behaviour that belongs in code. */
export const metricDataSchema = z
    .strictObject({
        /** The Prometheus name: snake_case, and `_total` exactly when it is a counter. */
        name: z.string().regex(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/),
        /** The Prometheus type. */
        kind: z.enum(['counter', 'gauge', 'histogram']),
        /** The `# HELP` line. */
        help: z.string().min(15),
        /** The label names, when it has any. */
        labelNames: z
            .array(z.string().regex(/^[a-z][a-z0-9_]*$/))
            .min(1)
            .optional(),
        /** Upper bounds of a histogram's buckets, ascending. */
        buckets: z.array(z.number().positive()).min(1).optional()
    })
    .refine((metric) => (metric.kind === 'histogram') === (metric.buckets !== undefined), {
        message: 'only a histogram has buckets, and every histogram does'
    })
    // One way only: a counter ends in `_total`, but a gauge may carry the suffix in the wild.
    .refine((metric) => metric.kind !== 'counter' || metric.name.endsWith('_total'), {
        message: 'a counter name ends in _total'
    });

/** A `metrics:` block, keyed by the camelCase name of the code's constant. */
export const metricsBlockSchema = z.record(
    z.string().regex(/^[a-z][A-Za-z0-9]*$/),
    metricDataSchema
);

/** Shape of `shared/rules/metrics.yaml`. */
export const metricsSchema = z.strictObject({ metrics: metricsBlockSchema }).refine(
    ({ metrics }) => {
        const names = Object.values(metrics).map((metric) => metric.name);
        return new Set(names).size === names.length;
    },
    { message: 'two metrics share a name' }
);
