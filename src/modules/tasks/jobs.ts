/**
 * @module
 * The scheduled job `tasks` owns: the overdue and due-soon reminder sweep.
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { settleOutboxNudges } from '@kernel/outbox';
import { logger } from '@infrastructure/adapters/logger';
import { tasksJobData } from './jobs.generated';
import { taskService } from './service';

/** The jobs `tasks` owns. */
export const tasksJobs: readonly JobDeclaration[] = [
    {
        ...tasksJobData.sweepTasksOverdue,
        run: () =>
            // Both passes in one job: a task is due soon or overdue, never both at once.
            Promise.all([taskService.remindOverdue(), taskService.remindDueSoon()])
                // The reminders are outbox rows; waiting for the nudged relay pass lets this
                // process deliver them before it exits. The minute backstop catches any left.
                .then((announced) => settleOutboxNudges().then(() => announced))
                .then(([overdue, dueSoon]) => {
                    logger.info({ message: 'Task reminder sweep done.', overdue, dueSoon });
                }),
        // The sweep only writes `task.overdue` and `task.due_soon` rows: `notifications` hears them through its
        // subscription, and the staff mail is rendered from the translations.
        needs: { subscriptions: true, i18n: true },
        // A sweep that outruns its day would only re-claim nothing, but one at a time is simpler.
        lease: { ttlMs: 30 * 60 * 1000 }
    }
];
