/**
 * @module
 * Self-deletion with a grace: the owner's `DELETE /account` locks the account and promises its
 * erasure at `purgeAt`; a mailed link or a sign-in cancels it; `./purge-deletions` erases it.
 * Staff cancel through `users`, and `account` hears of it as an event.
 *
 * See: docs/theory/data-retention.md#self-deletion-a-grace-under-one-month
 */

import { userService, type UserDocument } from '@modules/users';
import type { CallerContext } from '@types';
import { systemCallerContext } from '@kernel/permissions';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import {
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { accountAnalyticsEvents } from '../analytics';
import { accountAuditActions } from '../audit';
import { deletionPurgeAt } from '../config';
import {
    accountRestoredEmail,
    deletionScheduledEmail,
    greetableName,
    recipientLocale
} from '../emails';
import { authAccountDeleteTotal } from '../metrics';
import { ACCOUNT_RESTORE_TOKEN_TYPE } from '../token-types';
import { recordCancellation } from './erasure-ledger';
import { sendAccountMail } from './mail';
import { revokeFor } from './revocation';
import { issueToken, redeemLiveToken, refuseLink, removeTokens } from './tokens';

/** What `DELETE /account` answers: when it was asked and when the erasure falls due. */
export interface AccountDeletionSchedule {
    /** When the owner asked, and the account was locked. */
    requestedAt: Date;
    /** When the account is erased unless restored before. */
    purgeAt: Date;
}

/** How a scheduled deletion was cancelled by its owner (staff cancel through `users`). */
export type RestoreVia = 'link' | 'sign-in';

/**
 * Lock the caller's account, end its sessions, mail the restore link and record the request.
 *
 * Order matters: the lock and its session epoch land in one save, then the pending links die, then
 * the restore link is minted, so the purge of old links cannot take the new one with it. A failure
 * after the lock leaves a locked account without a mailed link; the owner can still restore it by
 * signing in.
 *
 * @param user - the account asking to be deleted
 * @param context - who asked
 * @returns the dates to answer with
 */
export const scheduleAccountDeletion = (
    user: UserDocument,
    context: CallerContext
): Promise<AccountDeletionSchedule> => {
    const requestedAt = new Date();
    const purgeAt = deletionPurgeAt(requestedAt);

    return userService
        .scheduleOwnDeletion(user, requestedAt, purgeAt)
        .then(() => revokeFor('deletion-scheduled', user.id))
        .then(() =>
            issueToken(
                user.id,
                ACCOUNT_RESTORE_TOKEN_TYPE,
                purgeAt.getTime() - requestedAt.getTime()
            )
        )
        .then((token) => {
            recordAudit(context, {
                action: accountAuditActions.AUTH_ACCOUNT_DELETE_SCHEDULED,
                actorUserId: user.id,
                outcome: 'success',
                metadata: { purgeAt: purgeAt.toISOString() }
            });
            emitAnalyticsEvent({
                ...buildAnalyticsBase(context),
                distinctId: user.id,
                event: accountAnalyticsEvents.ACCOUNT_DELETION_SCHEDULED
            });
            authAccountDeleteTotal.inc({ status: 'scheduled' });

            // The recipient's OWN language, the request's only as fallback; high priority, since a
            // person is waiting on the link.
            const mail = deletionScheduledEmail(
                recipientLocale(user.locale, context),
                greetableName(user, user.email),
                token,
                purgeAt
            );
            // eslint-disable-next-line @typescript-eslint/no-floating-promises -- sendAccountMail never rejects (enqueueEmail logs its own failure)
            void sendAccountMail(user.email, mail);
            return { requestedAt, purgeAt };
        });
};

/**
 * Cancel a scheduled deletion on the owner's behalf: clear the lock, drop any live restore link,
 * record it and mail the confirmation. A no-op answering `false` once the grace has run out.
 *
 * Restoring does not sign anyone in or revive a session: the epoch moved at the lock stays.
 *
 * @param user - the locked account
 * @param via - which proof the owner gave
 * @param context - the caller
 * @returns whether THIS call restored the account
 */
export const restoreAccount = (
    user: UserDocument,
    via: RestoreVia,
    context: CallerContext
): Promise<boolean> =>
    userService.restoreOwnAccount(user).then((restored) => {
        if (!restored) return false;

        return removeTokens(user.id, [ACCOUNT_RESTORE_TOKEN_TYPE])
            .then(() => recordCancellation(user.id))
            .then(() => {
                announceRestored(user, via, context);
                return true;
            });
    });

/**
 * The record of a restore: audit row, analytics event, metric and the mail. One place, so the
 * link, the sign-in and the staff restore leave the same trail.
 *
 * @param user - the restored account
 * @param via - `link`, `sign-in` or `staff`
 * @param context - the caller, or the staff member
 */
export const announceRestored = (
    user: Pick<UserDocument, 'id' | 'email' | 'locale' | 'username' | 'verifiedAt'>,
    via: RestoreVia | 'staff',
    context: CallerContext
): void => {
    recordAudit(context, {
        action: accountAuditActions.AUTH_ACCOUNT_DELETE_CANCELLED,
        actorUserId: user.id,
        outcome: 'success',
        metadata: { via }
    });
    if (via !== 'staff')
        emitAnalyticsEvent({
            ...buildAnalyticsBase(context),
            distinctId: user.id,
            event: accountAnalyticsEvents.ACCOUNT_RESTORED
        });
    authAccountDeleteTotal.inc({ status: 'cancelled' });

    const mail = accountRestoredEmail(
        recipientLocale(user.locale, context),
        greetableName(user, user.email),
        via === 'staff'
    );
    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- sendAccountMail never rejects (enqueueEmail logs its own failure)
    void sendAccountMail(user.email, mail);
};

/**
 * `POST /account/restore` — spend the mailed link and cancel the deletion. Does not sign in.
 *
 * @param token - the token from the mailed link
 * @param context - the caller
 * @returns success, or a 422 for a link that is unknown, expired, spent or past `purgeAt`
 */
export const restoreAccountByLink = (
    token: string,
    context: CallerContext
): Promise<ResponseSuccess<undefined> | ResponseReject> =>
    redeemLiveToken(ACCOUNT_RESTORE_TOKEN_TYPE, token).then((user) =>
        user
            ? restoreAccount(user, 'link', context).then((restored) =>
                  restored
                      ? generateSuccess(undefined, 200)
                      : refuseLink(context, 'account_restore', 'account.delete.token-not-found')
              )
            : refuseLink(context, 'account_restore', 'account.delete.token-not-found')
    );

/**
 * Staff cancelled a deletion through `users`: drop the restore link, which has nothing left to
 * restore, and tell the owner. Driven by the `user.deletion-cancelled` event; an account erased
 * before the event is handled has nobody left to tell.
 *
 * @param userId - the restored account
 */
export const handleRestoredByStaff = (userId: string): Promise<void> =>
    removeTokens(userId, [ACCOUNT_RESTORE_TOKEN_TYPE])
        .then(() => recordCancellation(userId))
        .then(() => userService.getById(userId))
        .then((user) => {
            // The staff member is in `users`' own audit row; this trail records the cancellation.
            if (user) announceRestored(user, 'staff', systemCallerContext('User'));
        });
