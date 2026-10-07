#!/usr/bin/env tsx
/**
 * @module
 * Delete stored invoice and credit-note PDFs past their retention window —
 * `npm run reap:invoice-pdfs`.
 *
 * A PDF is stored on its first download and kept for `NODE_INVOICE_PDF_RETENTION_DAYS` (30). It is
 * a regenerable copy: the frozen invoice DATA in Mongo is the legal record, so a reaped file costs
 * one Chromium render on the next download and nothing else. Age is the file's modification time,
 * set when it was rendered, not when it was last downloaded. A retention of `0` stores nothing, so
 * there is nothing to reap and this job finds an empty (or absent) directory.
 *
 * Filesystem-only and safe to run repeatedly. It connects to Mongo briefly, like
 * `reap:quarantine`, because `runScript` records the outcome in `leases`.
 *
 * Owned by `invoicing` — deletes with the module, along with the `reap:invoice-pdfs` npm script
 * and its `docker/crontab` line.
 *
 * See: docs/modules/invoicing.md
 */
import '@infrastructure/config/dotenv';
// Before any model loads: Mongoose defaults are read at schema build.
import '@infrastructure/runtime/mongoose-boot';
import { startJob, stopDatabase } from '@infrastructure/runtime/database';
import { logger } from '@infrastructure/adapters/logger';
import { reapDocuments } from '@infrastructure/adapters/document-store';
import { invoicingConfig } from '@modules/invoicing/config';
import { runScript } from '../run-script';

/** The retention window in ms. Zero days is a window of nothing: everything stored is reaped. */
const retentionMs = (): number =>
    invoicingConfig().NODE_INVOICE_PDF_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** Sweep first, connect after: the sweep never touches Mongo, only `runScript`'s record does. */
const main = (): Promise<void> =>
    reapDocuments(retentionMs())
        .then(({ checked, reaped }) =>
            logger.info({ message: 'Stored documents reaped.', checked, reaped })
        )
        .then(() => startJob());

// Entry point: run `main`, record the outcome under `reap:invoice-pdfs` for `/observability/health`,
// and close the connection on both paths. See `scripts/run-script.ts`.
void runScript('reap:invoice-pdfs', main, stopDatabase);
