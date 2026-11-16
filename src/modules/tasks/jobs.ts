/**
 * @module
 * The scheduled job `tasks` owns: the overdue and due-soon reminder sweep.
 *
 * @see docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { logger } from '@infrastructure/adapters/logger';
import { tasksJobData } from './jobs.generated';
import { taskService } from './services';
import { MINUTE_MS } from '@domain-primitives/time';

/** The jobs `tasks` owns. */
export const tasksJobs: readonly JobDeclaration[] = [
    {
        ...tasksJobData.sweepTasksOverdue,
        run: () =>
            // Both passes in one job: a task is due soon or overdue, never both at once.
            Promise.all([taskService.remindOverdue(), taskService.remindDueSoon()]).then(
                ([overdue, dueSoon]) => {
                    logger.info({ message: 'Task reminder sweep done.', overdue, dueSoon });
                }
            ),
        /** One sweep at a time; a sweep that outruns its day would only re-claim nothing. */
        lease: { ttlMs: 30 * MINUTE_MS }
    }
];
