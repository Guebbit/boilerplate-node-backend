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
 * Runs:      every 5 minutes, well inside the 30-minute card window and the 168-hour
 *            bank-transfer one — see docs/reference/ops.md#scheduled-jobs.
 * Removal:   owned by `inventory` — deletes with the module, along with the
 *            `sweep:reservations` npm script and its `docker/crontab` line.
 */
import '@infrastructure/config/dotenv';
import { start, stopDatabase } from '@infrastructure/runtime/database';
import { stopQueue } from '@infrastructure/adapters/queue';
import { bootI18n } from '@infrastructure/i18n';
import { registerModules } from '@kernel/registry';
import { enabledModules, enabledModuleLocales } from '../../src/modules';
import { inventoryService } from '@modules/inventory';
import { runScript } from '../run-script';

/** Connect, install the event subscriptions, expire every stale hold, and resolve nothing. */
const main = (): Promise<void> =>
    start()
        .then(() => {
            registerModules(enabledModules);
            return bootI18n(enabledModuleLocales());
        })
        .then(() => inventoryService.runReservationSweep())
        .then(() => undefined);

// Entry point: run `main`, record the outcome under `sweep:reservations` for `/observability/health`, and close
// the connections on both paths. See `scripts/run-script.ts`.
void runScript('sweep:reservations', main, () => Promise.all([stopDatabase(), stopQueue()]));
