#!/usr/bin/env tsx
/**
 * @module
 * Sweeps the invoice CACHE — `npm run reap:invoices`. Two independent sweeps, run together since
 * both are cheap and both belong to the same directory:
 *
 * - Orphans: a cached file with no order left to name it. Not a normal outcome — `orderService.
 *   remove()`'s hard-delete path cleans up its own file the moment the order goes — it happens
 *   anyway wherever a row is removed OUTSIDE that path: a scenario reset's `emptyDatabase()`
 *   (dev/test only, but the reason this half exists at all), a manual `deleteMany`, a crash
 *   between a hard delete's two steps.
 * - Expiry: a cached file past `invoiceCacheTtlMinutes()`. The cache's whole job is to absorb one
 *   person's burst; anything older is personal and financial data sitting on disk for nobody.
 *
 * Meant to run as a periodic job (cron, a scheduled container task) rather than by hand.
 *
 * See: docs/reference/ops.md
 */
import 'dotenv/config';
import { start, stopDatabase } from '@infrastructure/runtime/database';
import { logger } from '@infrastructure/adapters/logger';
import { orderService } from '@modules/orders';
import { runScript } from '../db/run-script';

/** Connect, run both sweeps, and log how many files each one reaped. */
const main = (): Promise<void> =>
    start()
        .then(() =>
            Promise.all([orderService.reapOrphanedInvoices(), orderService.reapExpiredInvoices()])
        )
        .then(([orphaned, expired]) => {
            if (orphaned > 0) logger.info({ message: 'Orphaned invoice PDFs reaped.', orphaned });
            if (expired > 0) logger.info({ message: 'Expired invoice PDFs reaped.', expired });
        });

void runScript(main, stopDatabase);
