#!/usr/bin/env tsx
/**
 * @module
 * Sweeps the invoice CACHE — `npm run reap:invoices`. Runs `orderService`'s two independent
 * sweeps together since both are cheap and both belong to the same directory: orphans
 * ({@link orderService.reapOrphanedInvoices}) and expiry ({@link orderService.reapExpiredInvoices}).
 *
 * Meant to run as a periodic job (cron, a scheduled container task) rather than by hand.
 *
 * See: docs/reference/ops.md
 */
import 'dotenv/config';
import { start, stopDatabase } from '@infrastructure/runtime/database';
import { logger } from '@infrastructure/adapters/logger';
import { orderService } from '@modules/orders';
import { runScript } from '../run-script';

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
