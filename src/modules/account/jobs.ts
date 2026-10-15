/**
 * @module
 * The scheduled jobs `account` owns: the inactivity reaper, the previous-email sweep and the
 * expired-export sweep.
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { logger } from '@infrastructure/adapters/logger';
import { accountConfig } from './config';
import { reapInactiveAccounts } from './services/reap-inactive';
import { reapLapsedPreviousEmails } from './services/previous-email-cleanup';
import { reapExpiredExports } from './services/export-rows';

/**
 * Minimise, then (opt in) warn and delete, accounts that have gone quiet. Both dials at 0 means
 * nothing to do.
 */
const reapInactive = (): Promise<void> => {
    const { NODE_INACTIVE_ACCOUNT_DAYS: inactiveDays, NODE_INACTIVE_MINIMISE_DAYS: minimiseDays } =
        accountConfig();
    if (inactiveDays <= 0 && minimiseDays <= 0) {
        logger.info({
            message:
                'Inactive-account reaper disabled (NODE_INACTIVE_ACCOUNT_DAYS and NODE_INACTIVE_MINIMISE_DAYS are 0).'
        });
        return Promise.resolve();
    }
    return reapInactiveAccounts({ inactiveDays, minimiseDays });
};

/** The jobs `account` owns, in the order they run each night. */
export const accountJobs: readonly JobDeclaration[] = [
    {
        name: 'reap:inactive-accounts',
        schedule: '5 2 * * *',
        summary:
            'Minimises an account inactive past NODE_INACTIVE_MINIMISE_DAYS; with deletion turned on, warns, then soft-, then hard-deletes one inactive past NODE_INACTIVE_ACCOUNT_DAYS.',
        run: reapInactive,
        // Minimise and erase hooks are resolved from the manifests, and the warning mail renders
        // translated copy. Leased: it hard-deletes accounts, so "exactly one runner" earns its keep.
        needs: { subscriptions: true, i18n: true },
        lease: { ttlMs: 15 * 60 * 1000 }
    },
    {
        name: 'reap:previous-emails',
        schedule: '7 2 * * *',
        summary:
            'Forgets the previous email of an account whose undo link has lapsed (sessions and one-time tokens delete themselves at their own expiry date).',
        run: () =>
            reapLapsedPreviousEmails().then((cleared) => {
                logger.info({ message: 'Previous emails reaped.', previousEmailsCleared: cleared });
            }),
        lease: { ttlMs: 30 * 60 * 1000 }
    },
    {
        name: 'reap:account-exports',
        schedule: '9 2 * * *',
        summary:
            'Deletes built data exports (file and row) past NODE_ACCOUNT_EXPORT_TTL_DAYS; the account can ask again.',
        run: () =>
            reapExpiredExports().then(({ rows, files }) => {
                logger.info({ message: 'Account exports reaped.', rows, strayFiles: files });
            })
    }
];
