#!/usr/bin/env tsx
/**
 * @module
 * Delete abandoned payment attempts — `npm run reap:payments`.
 *
 * Deletes, unlike `reap-orders.ts`: a payment that never reached `succeeded` or `refunded` was
 * never money, so there is no invoice to keep. It is an open checkout the customer walked away
 * from — a declined card nobody retried, a 3-D Secure challenge nobody answered — past
 * `NODE_PAYMENT_ABANDONED_RETENTION_DAYS` (default 30) since it was last touched. A payment that
 * ever settled is never a candidate here, or on any other timer — see
 * docs/modules/payments.md's retention section for why.
 *
 * Meant to run periodically (the same cron container as the other `reap:*` scripts), never on
 * every boot.
 *
 * See: docs/reference/ops.md
 */
import 'dotenv/config';
import { start, stopDatabase } from '@infrastructure/runtime/database';
import { paymentService } from '@modules/payments';
import { runScript } from '../db/run-script';

/** Connect, delete every abandoned payment attempt past its retention window, and resolve nothing. */
const main = (): Promise<void> =>
    start()
        .then(() => paymentService.reapAbandonedPayments())
        .then(() => undefined);

void runScript(main, stopDatabase);
