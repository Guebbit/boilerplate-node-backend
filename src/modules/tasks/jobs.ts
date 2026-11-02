/**
 * @module
 * The scheduled job `tasks` owns: the overdue reminder sweep.
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { logger } from '@infrastructure/adapters/logger';
import { tasksJobData } from './jobs.generated';
import { taskService } from './service';

/** The jobs `tasks` owns. */
export const tasksJobs: readonly JobDeclaration[] = [
    {
        ...tasksJobData.sweepTasksOverdue,
        run: () =>
            taskService.remindOverdue().then((announced) => {
                logger.info({ message: 'Overdue task sweep done.', announced });
            }),
        // The sweep only emits `task.overdue`: `notifications` hears it through its subscription,
        // and the staff mail is rendered from the translations.
        needs: { subscriptions: true, i18n: true },
        // A sweep that outruns its day would only re-claim nothing, but one at a time is simpler.
        lease: { ttlMs: 30 * 60 * 1000 }
    }
];
