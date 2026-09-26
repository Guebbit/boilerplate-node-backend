#!/usr/bin/env tsx
/**
 * @module
 * Expire every stale reservation hold — `npm run sweep:reservations`.
 *
 * `POST /inventory/reservations/sweep` is the admin route this shares its work with, but nothing
 * ever called it on a schedule (B3): an abandoned checkout held its units forever,
 * `RESERVATION_EXPIRED` never fired so an unpaid order never auto-cancelled, and a bank-transfer
 * hold never ended. `registerModules` is what makes that event actually reach `orders`' own
 * listener — without it this sweep would expire holds and cancel nothing behind them, the trap
 * `sweep-order-effects.ts` also guards against. `bootI18n` is for the bank-transfer expiry email
 * that cancel sends when the expiry (not a customer) is what triggered it.
 *
 * Order matters here more than it looks: B15 (an exception-safe reserve) and B14 (a settlement's
 * lost stock commit retried) both had to land before this could be scheduled at all, or scheduling
 * it would have turned their bugs into things that start happening on their own, every 5 minutes.
 *
 * Meant to run every 5 minutes, well inside the 30-minute card window and the 168-hour
 * bank-transfer one — see docs/reference/ops.md#scheduled-jobs.
 *
 * Removal: owned by `inventory` — deletes with the module, along with the
 * `sweep:reservations` npm script and its `docker/crontab` line.
 *
 * See: docs/reference/ops.md
 */
import 'dotenv/config';
import { start, stopDatabase } from '@infrastructure/runtime/database';
import { stopQueue } from '@infrastructure/adapters/queue';
import { bootI18n } from '@infrastructure/i18n';
import { registerModules } from '@kernel/registry';
import { enabledModules } from '../../src/modules';
import { inventoryService } from '@modules/inventory';
import { runScript } from '../run-script';

/**
 * Connect, install the event subscriptions, expire every stale hold, and resolve nothing.
 *
 * `registerModules` is what the other `reap:*` scripts can skip: this sweep works by emitting
 * `RESERVATION_EXPIRED`, and without the modules registered there is no `orders` listener to hear
 * it — the sweep would release every stale hold and cancel no order behind it.
 */
const main = (): Promise<void> =>
    start()
        .then(() => {
            registerModules(enabledModules);
            return bootI18n(
                enabledModules
                    .map((appModule) => appModule.locales)
                    .filter((directory) => directory !== undefined)
            );
        })
        .then(() => inventoryService.runReservationSweep())
        .then(() => undefined);

void runScript('sweep:reservations', main, () => Promise.all([stopDatabase(), stopQueue()]));
