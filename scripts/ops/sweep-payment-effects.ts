#!/usr/bin/env tsx
/**
 * @module
 * Finish what a settlement left owing — `npm run sweep:payment-effects`.
 *
 * Settlement is one transaction (payment, order, hold, outbox rows), so nothing is left half-done
 * by a crash; what can still be owed is the provider's side: a refund the provider has not
 * answered, and a payment whose webhook never arrived.
 *
 * It retries every refund the provider refused (`payments.refunds[].status` `failed` or
 * `pending`), with the same idempotency key, until it lands.
 *
 * And it reconciles unsettled payments untouched for `NODE_PAYMENT_RECONCILE_MINUTES`: the
 * provider is asked, and its answer settled, for a webhook that never arrived.
 *
 * No module registration needed: unlike `sweep-order-effects.ts`, this sweep calls the payment
 * service directly rather than emitting an event, so there is no listener it depends on.
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

/** Connect, retry every open refund, reconcile stale payments, resolve nothing. */
const main = (): Promise<void> =>
    startJob()
        .then(() => paymentService.retryOpenRefunds())
        .then(() => paymentService.reconcileStalePayments())
        .then(() => undefined);

// Entry point: run `main`, record the outcome under `sweep:payment-effects` for `/observability/health`, and close
// the connections on both paths. See `scripts/run-script.ts`.
void runScript('sweep:payment-effects', main, stopDatabase);
