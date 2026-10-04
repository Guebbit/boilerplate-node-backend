#!/usr/bin/env tsx
/**
 * @module
 * Expire every stale reservation hold — `npm run sweep:reservations`.
 *
 * Shares:    `POST /inventory/reservations/sweep`, the admin route this schedules; nothing else
 *            calls it, so without this schedule an abandoned checkout would hold its units forever.
 * Registers: `registerModules` first — this sweep works by emitting `RESERVATION_EXPIRED`, and
 *            without the modules registered there is no `orders` listener to hear it, the same
 *            trap `sweep-order-effects.ts` guards against.
 * i18n:      `bootI18n` is for the bank-transfer expiry email cancel sends when the expiry, not a
 *            customer, is what triggered it.
 * Runs:      every 5 minutes, well inside the card window and the 168-hour bank-transfer one,
 *            and drains every due hold under a lease — see docs/reference/ops.md#scheduled-jobs.
 * Removal:   owned by `inventory` — deletes with the module, along with the
 *            `sweep:reservations` npm script and its `docker/crontab` line.
 */
import '@infrastructure/config/dotenv';
import { startJob, stopDatabase } from '@infrastructure/runtime/database';
import { stopQueue } from '@infrastructure/adapters/queue';
import { bootI18n } from '@infrastructure/i18n';
import { registerModules } from '@kernel/registry';
import { enabledModules, enabledModuleLocales } from '../../src/modules';
import { inventoryService } from '@modules/inventory';
import { logger } from '@infrastructure/adapters/logger';
import { withLease } from '@infrastructure/persistence/lease';
import { runScript } from '../run-script';

/**
 * How long a holder that never releases (a crash) blocks the next run. Longer than a drain of
 * 10,000 holds takes, shorter than the hours it would take someone to notice.
 */
const LEASE_TTL_MS = 10 * 60 * 1000;

/**
 * Connect, install the event subscriptions, then drain every stale hold under the job's lease: a
 * drain can outlast the five-minute tick, and two drains racing would only fight over the same
 * claims. The lease needs the database, so the connection comes first.
 */
const main = (): Promise<void> =>
    startJob()
        .then(() => {
            registerModules(enabledModules);
            return bootI18n(enabledModuleLocales());
        })
        .then(() =>
            withLease('sweep:reservations', LEASE_TTL_MS, () =>
                inventoryService.runReservationSweep()
            )
        )
        .then((ran) => {
            if (ran === undefined)
                logger.info({
                    message: 'Reservation sweep skipped: another holder already has the lease.'
                });
        });

// Entry point: run `main`, and close the connections on both paths. No job name is passed: the
// lease records this job's outcome under `sweep:reservations` itself, and recording again here
// would turn a skipped run (lease held) into a false success. See `scripts/run-script.ts`.
void runScript(undefined, main, () => Promise.all([stopDatabase(), stopQueue()]));
