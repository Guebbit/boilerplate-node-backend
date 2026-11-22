/**
 * @module
 * The scheduled jobs `zammad` owns: the minute pass that hands waiting messages over (the nudge
 * after the `202` is the fast path, this is the safety net), the pass that keeps customer
 * profiles current, the erase sweep and the daily retention pass.
 *
 * @see docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { MINUTE_MS } from '@domain-primitives/time';
import { logger } from '@infrastructure/adapters/logger';
import { zammadJobData } from './jobs.generated';
import { zammadService } from './services';

/** The jobs `zammad` owns. */
export const zammadJobs: readonly JobDeclaration[] = [
    {
        ...zammadJobData.sweepZammadContacts,
        run: () =>
            zammadService.sweepContacts().then((handled) => {
                logger.info({ message: 'Zammad contact sweep done.', handled });
            }),
        lease: { ttlMs: 10 * MINUTE_MS }
    },
    {
        ...zammadJobData.sweepZammadProfiles,
        run: () =>
            zammadService.sweepProfiles().then((handled) => {
                logger.info({ message: 'Zammad profile sweep done.', handled });
            }),
        lease: { ttlMs: 10 * MINUTE_MS }
    },
    {
        ...zammadJobData.sweepZammadErasures,
        run: () =>
            zammadService.sweepErasures().then((handled) => {
                logger.info({ message: 'Zammad erase sweep done.', handled });
            }),
        lease: { ttlMs: 10 * MINUTE_MS }
    },
    {
        ...zammadJobData.reapZammadRetention,
        run: () => zammadService.reapRetention().then(() => undefined),
        lease: { ttlMs: 60 * MINUTE_MS }
    }
];
