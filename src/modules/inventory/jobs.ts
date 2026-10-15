/**
 * @module
 * The scheduled job `inventory` owns: the stale-hold drain.
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { settleOutboxNudges } from '@kernel/outbox';
import { runReservationSweep } from './services/sweep';

/** The jobs `inventory` owns. */
export const inventoryJobs: readonly JobDeclaration[] = [
    {
        name: 'sweep:reservations',
        // Every 5 minutes, well inside the card window and the 168-hour bank-transfer one.
        schedule: '*/5 * * * *',
        summary:
            'Drains every stale checkout hold (batches of 200) and cancels the order behind each.',
        // Each expiry's announcement rides the outbox; settled inside the lease so `orders` has
        // heard every one before the connections close.
        run: () => runReservationSweep().then(() => settleOutboxNudges()),
        needs: { subscriptions: true, i18n: true },
        // A drain can outlast the five-minute tick, and two drains racing would only fight over
        // the same claims. Longer than a drain of 10,000 holds takes.
        lease: { ttlMs: 10 * 60 * 1000 }
    }
];
