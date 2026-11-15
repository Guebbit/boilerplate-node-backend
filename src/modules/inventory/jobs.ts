/**
 * @module
 * The scheduled job `inventory` owns: the stale-hold drain.
 *
 * @see docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { inventoryJobData } from './jobs.generated';
import { runReservationSweep } from './services/sweep';
import { MINUTE_MS } from '@domain-primitives/time';

/** The jobs `inventory` owns. */
export const inventoryJobs: readonly JobDeclaration[] = [
    {
        ...inventoryJobData.sweepReservations,
        run: () => runReservationSweep(),
        // A drain can outlast the five-minute tick, and two drains racing would only fight over
        // the same claims. Longer than a drain of 10,000 holds takes.
        lease: { ttlMs: 10 * MINUTE_MS }
    }
];
