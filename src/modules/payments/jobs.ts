/**
 * @module
 * The scheduled jobs `payments` owns: the abandoned-attempt reaper and the effect retries.
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { paymentsJobData } from './jobs.generated';
import { reapAbandonedPayments } from './services/retention';
import { retryOpenRefunds, reconcileStalePayments } from './services/effects';
import { MINUTE_MS } from '@domain-primitives/time';

/** The jobs `payments` owns. */
export const paymentsJobs: readonly JobDeclaration[] = [
    {
        ...paymentsJobData.reapPayments,
        run: () => reapAbandonedPayments()
    },
    {
        ...paymentsJobData.sweepPaymentEffects,
        run: () => retryOpenRefunds().then(() => reconcileStalePayments()),
        // A provider that hangs can keep one pass past its 5-minute interval; the lease stops a
        // second pass sending the same idempotency keys while the first is still running.
        lease: { ttlMs: 10 * MINUTE_MS }
    }
];
