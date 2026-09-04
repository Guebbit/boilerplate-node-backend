#!/usr/bin/env tsx
/**
 * @module
 * Scrub order PII past its retention window — `npm run reap:orders`.
 *
 * Unlike `reap-quarantine.ts` and `reap-inactive-accounts.ts`, this never deletes a row: an order
 * is an invoice, kept whole under Art. 17(3)(b)/(e) regardless of what happens to the account
 * that placed it. `users`' `USER_DELETED` listener (`orders/module.ts`) unsets `userId` and
 * stamps `anonymizeAfter` the moment an account is erased; this script is the other half — once
 * that date arrives, it replaces the order's remaining PII (email, shipping name/phone/street)
 * with placeholders. Amounts, line items, dates, city and country survive: revenue history stays
 * intact, only the person is gone from it.
 *
 * Meant to run periodically (the same cron container as the other `reap:*` scripts), never on
 * every boot.
 *
 * See: docs/reference/ops.md
 */
import 'dotenv/config';
import { start, stopDatabase } from '@infrastructure/runtime/database';
import { orderService } from '@modules/orders';
import { runScript } from '../db/run-script';

const main = (): Promise<void> =>
    start()
        .then(() => orderService.anonymizeDueOrders())
        .then(() => undefined);

void runScript(main, stopDatabase);
