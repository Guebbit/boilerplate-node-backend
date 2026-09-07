#!/usr/bin/env tsx
/**
 * @module
 * Retry the consequences a cancel could not guarantee — `npm run sweep:order-effects`.
 *
 * A cancel moves the status, releases the hold and announces `ORDER_CANCELLED` so `payments`
 * refunds. The stock half heals on its own: the hold keeps its `expiresAt` and the reservation
 * sweep releases it. The money half does not — the domain event bus has no retry, so a provider
 * unreachable for the length of one call leaves the order cancelled and the refund never made.
 * `cancelById` writes that intent into the order in the same write that cancels it; this script
 * is the other half, re-announcing for whatever is still standing.
 *
 * Meant to run periodically (the same cron container as the `reap:*` scripts), never on every
 * boot. Idempotent: `payments`' conditional refund means a second pass over an order that already
 * settled does nothing.
 *
 * See: docs/reference/ops.md
 */
import 'dotenv/config';
import { start, stopDatabase } from '@infrastructure/runtime/database';
import { registerModules } from '@kernel/registry';
import { enabledModules } from '../src/modules';
import { orderService } from '@modules/orders';
import { runScript } from '../db/run-script';

/**
 * Connect, install the event subscriptions, retry every owed effect, and resolve nothing.
 *
 * `registerModules` is what the other `reap:*` scripts can skip: this sweep works by emitting
 * `ORDER_CANCELLED`, and without the modules registered there is no `payments` listener to hear
 * it — the sweep would clear every marker having refunded nothing.
 */
const main = (): Promise<void> =>
    start()
        .then(() => {
            registerModules(enabledModules);
        })
        .then(() => orderService.retryPendingEffects())
        .then(() => undefined);

void runScript(main, stopDatabase);
