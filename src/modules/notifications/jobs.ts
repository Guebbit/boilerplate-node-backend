/**
 * @module
 * The scheduled jobs `notifications` owns: the daily and the weekly staff digest.
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { logger } from '@infrastructure/adapters/logger';
import { runStaffDigest, type DigestRun } from './services/digest';

/** One digest job: the run it does, and how it logs. */
const digestJob = (run: DigestRun, schedule: string, summary: string): JobDeclaration => ({
    name: `sweep:staff-${run === 'daily' ? 'digest' : 'weekly'}`,
    schedule,
    summary,
    run: () =>
        runStaffDigest(run).then((result) => {
            logger.info({ message: `Staff ${run} digest done.`, ...result });
        }),
    // Rendering the mail needs the translations; the rows need no subscriptions.
    needs: { i18n: true },
    lease: { ttlMs: 30 * 60 * 1000 }
});

/** The jobs `notifications` owns. */
export const notificationsJobs: readonly JobDeclaration[] = [
    digestJob(
        'daily',
        '30 6 * * *',
        'Rewrites the staff summary rows (transfers due, unshipped, undecided returns, open holds, missing tracking codes, undelivered parcels, stale refunds, low stock) and mails each person the overdue ones that appeared or grew.'
    ),
    digestJob(
        'weekly',
        '30 6 * * 1',
        'Rewrites the late-preorder summary row for the staff who edit orders, and mails it when it appeared or grew.'
    )
];
