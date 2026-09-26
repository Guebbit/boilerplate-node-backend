#!/usr/bin/env tsx
/**
 * @module
 * Retry a stock commit a settlement started but never finished — `npm run sweep:payment-effects`.
 *
 * `settlePayment` sets `pendingEffects: ['commit']` in the same write that moves a payment to
 * `succeeded`, then commits the held stock and clears it. A crash between those two steps (the
 * order read, the commit itself) leaves the marker standing with nothing to redeliver it — unlike
 * a webhook, nobody retries a settlement that already answered its caller. This sweep is the only
 * thing that ever will (B14).
 *
 * No module registration needed: unlike `sweep-order-effects.ts`, this sweep calls
 * `inventoryService.commitForOrder` directly rather than emitting an event, so there is no
 * listener it depends on.
 *
 * Meant to run every 5 minutes, well inside the 30-minute reservation hold — see
 * docs/reference/ops.md#scheduled-jobs.
 *
 * Removal: owned by `stock-pay` — deletes with B14, along with the `sweep:payment-effects` npm
 * script and its `docker/crontab` line.
 *
 * See: docs/reference/ops.md
 */
import 'dotenv/config';
import { start, stopDatabase } from '@infrastructure/runtime/database';
import { paymentService } from '@modules/payments';
import { runScript } from '../run-script';

/** Connect, retry every owed effect, and resolve nothing. */
const main = (): Promise<void> =>
    start()
        .then(() => paymentService.retryPendingEffects())
        .then(() => undefined);

void runScript('sweep:payment-effects', main, stopDatabase);
