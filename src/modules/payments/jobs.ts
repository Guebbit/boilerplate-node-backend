/**
 * @module
 * The scheduled jobs `payments` owns: the abandoned-attempt reaper and the effect retries.
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { reapAbandonedPayments } from './services/retention';
import { retryOpenRefunds, reconcileStalePayments } from './services/effects';

/** The jobs `payments` owns. */
export const paymentsJobs: readonly JobDeclaration[] = [
    {
        name: 'reap:payments',
        schedule: '15 2 * * *',
        summary: 'Deletes abandoned (never-settled) payment attempts past their retention window.',
        run: () => reapAbandonedPayments()
    },
    {
        name: 'sweep:payment-effects',
        // Every 5 minutes, well inside the 30-minute reservation hold a stuck `commit` would
        // otherwise outlive.
        schedule: '*/5 * * * *',
        summary:
            'Retries refunds the provider has not answered, and settles unsettled payments whose webhook never arrived.',
        run: () => retryOpenRefunds().then(() => reconcileStalePayments()),
        // A provider that hangs can keep one pass past its 5-minute interval; the lease stops a
        // second pass sending the same idempotency keys while the first is still running.
        lease: { ttlMs: 10 * 60_000 }
    }
];
