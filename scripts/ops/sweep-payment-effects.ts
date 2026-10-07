#!/usr/bin/env tsx
/**
 * @module
 * Retry the stock commit or refund a settlement started but never finished — `npm run
 * sweep:payment-effects`.
 *
 * `settlePayment` sets `pendingEffects: ['commit']` in the same write that moves a payment to
 * `succeeded`, then commits the held stock (or, if the order has moved on, marks the refund owed
 * instead) and clears the marker. A crash between those steps leaves the marker standing with
 * nothing to redeliver it — unlike a webhook, nobody retries a settlement that already answered
 * its caller. This sweep is the only thing that ever will.
 *
 * It also retries every refund the provider refused (`payments.refunds[].status` `failed` or
 * `pending`), with the same idempotency key, until it lands.
 *
 * No module registration needed: unlike `sweep-order-effects.ts`, this sweep calls
 * `inventoryService.commitForOrder` and `orderService.markRefundOwed` directly rather than
 * emitting an event, so there is no listener it depends on.
 *
 * Meant to run every 5 minutes, well inside the 30-minute reservation hold — see
 * docs/reference/ops.md#scheduled-jobs.
 *
 * Removal: owned by the payments module — delete it when removing the module, along with the
 * `sweep:payment-effects` npm script and its `docker/crontab` line.
 *
 * See: docs/reference/ops.md
 */
import '@infrastructure/config/dotenv';
// Before any model loads: Mongoose defaults are read at schema build.
import '@infrastructure/runtime/mongoose-boot';
import { startJob, stopDatabase } from '@infrastructure/runtime/database';
import { paymentService } from '@modules/payments';
import { runScript } from '../run-script';

/** Connect, retry every owed effect and every open refund, and resolve nothing. */
const main = (): Promise<void> =>
    startJob()
        .then(() => paymentService.retryPendingEffects())
        .then(() => paymentService.retryOpenRefunds())
        .then(() => undefined);

// Entry point: run `main`, record the outcome under `sweep:payment-effects` for `/observability/health`, and close
// the connections on both paths. See `scripts/run-script.ts`.
void runScript('sweep:payment-effects', main, stopDatabase);
