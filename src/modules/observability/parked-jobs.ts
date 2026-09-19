/**
 * @module
 * The queue half of `GET /observability/health`: every worker queue's current dead-letter depth,
 * read live off the broker. Unlike `dependency-health.ts` this DOES do I/O — the same reasoning
 * `job-health.ts` already gives for its own `leases` query, since a queue's parked count exists
 * nowhere in this process's memory either.
 *
 * See: docs/tools/prometheus.md
 */

import type { ObservabilityHealthQueue } from '@types';
import { parkedCounts } from '@infrastructure/adapters/queue';

/**
 * Every worker queue's current dead-letter depth, in the wire shape `ObservabilityHealth.queues`
 * declares. Empty rather than zero-filled for a queue {@link parkedCounts} could not reach — see
 * its own docblock for why a partial answer beats a false "nothing is parked."
 */
export const queueHealth = (): Promise<ObservabilityHealthQueue[]> => parkedCounts();
