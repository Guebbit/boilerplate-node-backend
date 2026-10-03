/**
 * @module
 * Optional capability, in its own file: the Prometheus counters this module owns, registered on
 * the shared registry. Delete the file and the `.inc()` call to drop it.
 *
 * See: docs/tools/observability.md
 */

import { Counter } from 'prom-client';
import { metricsRegistry } from '@infrastructure/observability/metrics-registry';

/** Examples created. The one number that says whether anyone is using the module at all. */
export const exampleCreatedTotal = new Counter({
    // Prometheus naming: `<domain>_<subject>_total` for a counter.
    name: 'example_created_total',
    help: 'Total examples created.',
    registers: [metricsRegistry]
});
