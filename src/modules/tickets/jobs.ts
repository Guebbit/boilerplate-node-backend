/**
 * @module
 * The scheduled job `tickets` owns: the overdue reminder sweep.
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { logger } from '@infrastructure/adapters/logger';
import { ticketsJobData } from './jobs.generated';
import { ticketService } from './service';

/** The jobs `tickets` owns. */
export const ticketsJobs: readonly JobDeclaration[] = [
    {
        ...ticketsJobData.sweepTicketsOverdue,
        run: () =>
            ticketService.remindOverdue().then((announced) => {
                logger.info({ message: 'Overdue ticket sweep done.', announced });
            }),
        // The sweep only emits `ticket.overdue`: `notifications` hears it through its subscription,
        // and the staff mail is rendered from the translations.
        needs: { subscriptions: true, i18n: true },
        // A sweep that outruns its day would only re-claim nothing, but one at a time is simpler.
        lease: { ttlMs: 30 * 60 * 1000 }
    }
];
