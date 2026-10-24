/**
 * @module
 * The purge: erases every account whose self-deletion grace has run out. The job
 * `reap:scheduled-deletions` runs it hourly; only the purge discharges GDPR Art. 17, the lock at
 * request time is a restriction.
 *
 * See: docs/theory/data-retention.md#self-deletion-a-grace-under-one-month
 */

import { userService, type UserDocument } from '@modules/users';
import { logger } from '@infrastructure/adapters/logger';
import { systemCallerContext } from '@kernel/permissions';
import { recordAudit } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';
import { accountDeletedEmail, greetableName, recipientLocale } from '../emails';
import { authAccountDeleteTotal } from '../metrics';
import { sendAccountMail } from './mail';

/** What one run did: accounts erased, refused because a restore got there first, and failed. */
export interface PurgeCounts {
    /** Accounts erased. */
    purged: number;
    /** Accounts restored between the read and the erase. */
    skipped: number;
    /** Accounts whose erasure threw; they stay due and the next run retries. */
    failed: number;
}

/**
 * Erase one due account and, once it is gone, say goodbye and record it. The address, locale and
 * name are copied first: after a hard delete there is no document left to read them from.
 *
 * @param user - an account the due read returned
 * @returns what became of it
 */
const purgeOne = (user: UserDocument): Promise<keyof PurgeCounts> => {
    const { id, email, locale } = user;
    const name = greetableName(user, email);
    const context = systemCallerContext('User');

    return userService
        .eraseScheduledDeletion(user, context)
        .then((result) => {
            if (!result.success) return 'skipped';

            recordAudit(context, {
                action: accountAuditActions.AUTH_ACCOUNT_DELETE_COMPLETED,
                actorUserId: id,
                outcome: 'success'
            });
            authAccountDeleteTotal.inc({ status: 'purged' });
            // Normal priority: a goodbye nobody is waiting on.
            void sendAccountMail(
                email,
                accountDeletedEmail(recipientLocale(locale), name),
                'normal'
            );
            return 'purged';
        })
        .catch((error: unknown) => {
            authAccountDeleteTotal.inc({ status: 'failure' });
            logger.error({ message: 'Scheduled account erasure failed.', userId: id, error });
            return 'failed';
        });
};

/**
 * Erase every owner-scheduled account whose `purgeAt` has passed. One at a time, a failure logged
 * and counted without stopping the rest.
 *
 * Needs every module's erase hooks registered and translations booted; the caller owns both, and
 * the job's lease.
 *
 * @returns how many accounts each outcome covered
 */
export const purgeScheduledDeletions = async (): Promise<PurgeCounts> => {
    // App time, never the database's: the demo clock moves only the app's.
    const due = await userService.findDueScheduledDeletions(new Date());
    const counts: PurgeCounts = { purged: 0, skipped: 0, failed: 0 };
    for (const user of due) counts[await purgeOne(user)] += 1;
    logger.info({ message: 'Scheduled-deletion purge complete.', ...counts });
    return counts;
};
