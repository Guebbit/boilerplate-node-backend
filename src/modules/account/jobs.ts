/**
 * @module
 * The scheduled jobs `account` owns: the inactivity reaper, the previous-email sweep, the
 * expired-export sweep and the purge of accounts whose self-deletion grace has run out.
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { accountJobData } from './jobs.generated';
import { logger } from '@infrastructure/adapters/logger';
import { accountConfig } from './config';
import { reapInactiveAccounts, type InactiveReapCounts } from './services/reap-inactive';
import { reapLapsedPreviousEmails } from './services/previous-email-cleanup';
import { reapExpiredExports } from './services/export-rows';
import { purgeScheduledDeletions } from './services/purge-deletions';

/**
 * Minimise, then (opt in) warn and delete, accounts that have gone quiet. Both dials at 0 means
 * nothing to do.
 */
const reapInactive = (): Promise<InactiveReapCounts> => {
    const { NODE_INACTIVE_ACCOUNT_DAYS: inactiveDays, NODE_INACTIVE_MINIMISE_DAYS: minimiseDays } =
        accountConfig();
    if (inactiveDays <= 0 && minimiseDays <= 0) {
        logger.info({
            message:
                'Inactive-account reaper disabled (NODE_INACTIVE_ACCOUNT_DAYS and NODE_INACTIVE_MINIMISE_DAYS are 0).'
        });
        return Promise.resolve({ minimised: 0, warned: 0, softDeleted: 0, hardDeleted: 0 });
    }
    return reapInactiveAccounts({ inactiveDays, minimiseDays });
};

/** The jobs `account` owns: the nightly sweeps in the order they run, then the hourly purge. */
export const accountJobs: readonly JobDeclaration[] = [
    {
        ...accountJobData.reapInactiveAccounts,
        run: reapInactive,
        // Minimise and erase hooks are resolved from the manifests, and the warning mail renders
        // translated copy. Leased: it hard-deletes accounts, so "exactly one runner" earns its keep.
        needs: { subscriptions: true, i18n: true },
        lease: { ttlMs: 15 * 60 * 1000 }
    },
    {
        ...accountJobData.reapPreviousEmails,
        run: () =>
            reapLapsedPreviousEmails().then((cleared) => {
                logger.info({ message: 'Previous emails reaped.', previousEmailsCleared: cleared });
                return { cleared };
            }),
        lease: { ttlMs: 30 * 60 * 1000 }
    },
    {
        ...accountJobData.reapAccountExports,
        run: () =>
            reapExpiredExports().then(({ rows, files }) => {
                logger.info({ message: 'Account exports reaped.', rows, strayFiles: files });
                return { rows, files };
            })
    },
    {
        ...accountJobData.reapScheduledDeletions,
        run: purgeScheduledDeletions,
        // Erase hooks come from the manifests and the goodbye mail renders translated copy.
        // Leased: it hard-deletes accounts, so "exactly one runner" earns its keep.
        needs: { subscriptions: true, i18n: true },
        lease: { ttlMs: 15 * 60 * 1000 }
    }
];
