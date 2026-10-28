/**
 * @module
 * The scheduled jobs `notifications` owns: the daily and the weekly staff digest.
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import type { JobData } from '@infrastructure/config/shared-rules/jobs';
import { notificationsJobData } from './jobs.generated';
import { logger } from '@infrastructure/adapters/logger';
import { runStaffDigest, type DigestRun } from './services/digest';

/** One digest job: the run it does, its data from `module.yaml`, and how it logs. */
const digestJob = (run: DigestRun, data: JobData): JobDeclaration => ({
    ...data,
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
    digestJob('daily', notificationsJobData.sweepStaffDigest),
    digestJob('weekly', notificationsJobData.sweepStaffWeekly)
];
