#!/usr/bin/env tsx
/**
 * @module
 * Retry the consequences a cancel could not guarantee — `npm run sweep:order-effects`.
 *
 * A cancel moves the status, releases the hold and announces `ORDER_REFUND_OWED` so `payments`
 * refunds — a separate event from the customer-facing `ORDER_CANCELLED`, so this sweep's retry
 * never re-delivers that webhook. This sweep only retries the money half — the domain event bus
 * has no retry of its own, so a provider unreachable for the length of one call leaves the order
 * cancelled and the refund never made. The stock half is NOT covered here, and `sweep:reservations`
 * does not cover all of it either: its query only matches `held` holds, so a paid order's
 * `committed` hold — restocked by the cancel rather than released — is never retried if that
 * restock throws, and those units stay lost from sale. `cancelById` writes the refund intent into
 * the order in the same write that cancels it; this script is the other half, re-announcing for
 * whatever is still standing.
 *
 * Meant to run periodically (the same cron container as the `reap:*` scripts), never on every
 * boot. Idempotent: `payments`' conditional refund means a second pass over an order that already
 * settled does nothing.
 *
 * Removal: owned by `orders` — deletes with the module, along with the `sweep:order-effects` npm
 * script and its `docker/crontab` line.
 *
 * See: docs/reference/ops.md
 */
import 'dotenv/config';
import { start, stopDatabase } from '@infrastructure/runtime/database';
import { registerModules } from '@kernel/registry';
import { enabledModules } from '../../src/modules';
import { orderService } from '@modules/orders';
import { runScript } from '../run-script';

/**
 * Connect, install the event subscriptions, retry every owed effect, and resolve nothing.
 *
 * `registerModules` is what the other `reap:*` scripts can skip: this sweep works by emitting
 * `ORDER_REFUND_OWED`, and without the modules registered there is no `payments` listener to hear
 * it — the sweep would clear every marker having refunded nothing.
 */
const main = (): Promise<void> =>
    start()
        .then(() => {
            registerModules(enabledModules);
        })
        .then(() => orderService.retryPendingEffects())
        .then(() => undefined);

void runScript('sweep:order-effects', main, stopDatabase);
