#!/usr/bin/env tsx
/**
 * @module
 * Delete stored invoice PDFs with no order left to name them — `npm run reap:invoices`.
 *
 * An orphan is not a normal outcome of the invoice pipeline: `orderService.remove()`'s hard-delete
 * path cleans up its own file the moment the order goes. It happens anyway wherever a row is
 * removed OUTSIDE that path — a scenario reset's `emptyDatabase()` (dev/test only, but the reason
 * this script exists at all), a manual `deleteMany`, a crash between a hard delete's two steps.
 * This is the backstop for whatever still gets through, meant to run as a periodic job (cron, a
 * scheduled container task) rather than by hand.
 *
 * See: docs/reference/ops.md
 */
import 'dotenv/config';
import { start, stopDatabase } from '@infrastructure/runtime/database';
import { logger } from '@infrastructure/adapters/logger';
import { orderService } from '@modules/orders';
import { runScript } from '../db/run-script';

/** Connect, delete every orphaned invoice PDF, and log how many. */
const main = (): Promise<void> =>
    start()
        .then(() => orderService.reapOrphanedInvoices())
        .then((reaped) => {
            if (reaped > 0) logger.info({ message: 'Orphaned invoice PDFs reaped.', reaped });
        });

void runScript(main, stopDatabase);
