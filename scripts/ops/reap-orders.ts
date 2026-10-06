#!/usr/bin/env tsx
/**
 * @module
 * Scrub order PII past its retention window — `npm run reap:orders`.
 *
 * Unlike `reap-quarantine.ts` and `reap-inactive-accounts.ts`, this never deletes a row: an order
 * is an invoice, kept whole under Art. 17(3)(b)/(e) regardless of what happens to the account
 * that placed it. `users`' `personalData.erase` hook (`orders/module.ts`) unsets `userId` and
 * stamps `anonymizeAfter` to `max(now, createdAt + NODE_ORDER_PII_RETENTION_DAYS)` the moment an
 * account is erased — an order already past its own window is due almost immediately, not given a
 * fresh retention period. This script is the other half — once that date arrives, it replaces the
 * order's remaining PII: the email is replaced, both addresses and the notes are unset. Amounts,
 * line items and dates survive: revenue history stays intact, only the person is gone from it.
 *
 * Meant to run periodically (the same cron container as the other `reap:*` scripts), never on
 * every boot.
 *
 * Removal: owned by `orders` — deletes with the module, along with the `reap:orders` npm script
 * and its `docker/crontab` line.
 *
 * See: docs/reference/ops.md
 */
import '@infrastructure/config/dotenv';
import { startJob, stopDatabase } from '@infrastructure/runtime/database';
import { orderService } from '@modules/orders';
import { runScript } from '../run-script';

/** Connect, anonymize every order past its retention window, and resolve nothing. */
const main = (): Promise<void> =>
    startJob()
        .then(() => orderService.anonymizeDueOrders())
        .then(() => undefined);

// Entry point: run `main`, record the outcome under `reap:orders` for `/observability/health`, and close
// the connections on both paths. See `scripts/run-script.ts`.
void runScript('reap:orders', main, stopDatabase);
