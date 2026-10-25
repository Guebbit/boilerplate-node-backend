/**
 * @module
 * The scheduled job `invoicing` owns: the stored-PDF reaper and the buyer-block reaper.
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { logger } from '@infrastructure/adapters/logger';
import { reapDocuments } from '@infrastructure/adapters/document-store';
import { invoicingConfig } from './config';
import { eraseDueBuyers } from './services/retention';
import { DAY_MS } from '@domain-primitives/time';

/** The retention window in ms. Zero days is a window of nothing: everything stored is reaped. */
const retentionMs = (): number => invoicingConfig().NODE_INVOICE_PDF_RETENTION_DAYS * DAY_MS;

/** The jobs `invoicing` owns. */
export const invoicingJobs: readonly JobDeclaration[] = [
    {
        name: 'reap:invoice-pdfs',
        schedule: '8 2 * * *',
        summary:
            'Deletes stored invoice and credit-note PDFs past their retention window; the next download renders again.',
        run: () =>
            reapDocuments(retentionMs()).then(({ checked, reaped }) => {
                logger.info({ message: 'Stored documents reaped.', checked, reaped });
            }),
        // The sweep never touches Mongo; only the outcome record does.
        connectFirst: false
    },
    {
        name: 'reap:invoices',
        schedule: '14 2 * * *',
        summary:
            "Blanks an invoice's or credit note's buyer block once its tax retention has ended; the numbered document stays and its cached PDF is deleted.",
        run: () =>
            eraseDueBuyers().then((erased) => {
                logger.info({ message: 'Invoice buyer blocks erased.', ...erased });
            })
    }
];
