/**
 * @module
 * Switching an account on or off: `activate` and `deactivate`. Deactivating is a ban today, so it
 * ends every session in the same save (the `active` gate alone would let the old tokens back in
 * the moment someone activates the account again) and announces `user.deactivated` with it.
 * Each refuses a repeat with 409 rather than answering success twice.
 *
 * See: docs/modules/users.md#activating-and-deactivating
 */

import { t } from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { withTransaction } from '@infrastructure/runtime/database';
import { announceWithin, nudgeOutbox } from '@kernel/outbox';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import { ERROR_CODES } from '@api/error-codes';
import type { CallerContext } from '@types';
import { accessService } from '@modules/access';
import type { UserDocument } from '../model';
import { userRepository } from '../repository';
import { usersAnalyticsEvents } from '../analytics';
import { usersAuditActions } from '../audit';
import { USER_DEACTIVATED } from '../events';
import { markSessionsEnded } from './credentials';

/**
 * Load the account and clear what any switch must clear: it exists, and the caller may change it.
 *
 * @param id - the account
 * @param context - the caller
 * @param next - what to do with the loaded account once cleared
 */
const withClearedAccount = (
    id: string,
    context: CallerContext,
    next: (user: UserDocument) => Promise<ResponseSuccess<UserDocument> | ResponseReject>
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    userRepository.findById(id).then((user) => {
        // Returned, not thrown: a thrown miss is indistinguishable from a database error.
        if (!user) return generateReject(404, [t('users.not-found')]);

        return accessService
            .roleProtectedRefusal(context, id)
            .then((refusal) => refusal ?? next(user));
    });

/**
 * Let a deactivated account sign in again. Sessions it held stay ended: its owner logs in anew.
 *
 * @param id - the account
 * @param context - the caller, judged against the account like any ban
 * @returns the user; 404 when there is none, 403 `ROLE_MANAGEMENT_REQUIRED` for a staff account the
 *   caller may not manage, 409 `USER_ALREADY_ACTIVE` when it is active already
 */
export const activate = (
    id: string,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    withClearedAccount(id, context, (user) => {
        if (user.active ?? true)
            return Promise.resolve(
                generateReject(409, [
                    {
                        code: ERROR_CODES.USER_ALREADY_ACTIVE,
                        message: t('users.already-active')
                    }
                ])
            );

        user.active = true;
        return userRepository.save(user).then((saved) => {
            recordAudit(context, {
                action: usersAuditActions.ADMIN_USER_UNBANNED,
                outcome: 'success',
                targetType: 'user',
                targetId: id
            });
            return generateSuccess(saved, 200, t('users.activated'));
        });
    });

/**
 * Lock an account out and end every session it holds, in one save with the `user.deactivated`
 * announcement, so the account's one-time links are purged exactly when its sessions died.
 *
 * @param id - the account
 * @param context - the caller, judged against the account like any ban
 * @returns the user; 404 when there is none, 403 `ROLE_MANAGEMENT_REQUIRED` for a staff account the
 *   caller may not manage, 409 `USER_ALREADY_INACTIVE` when it is deactivated already
 */
export const deactivate = (
    id: string,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    withClearedAccount(id, context, (user) => {
        if (!(user.active ?? true))
            return Promise.resolve(
                generateReject(409, [
                    {
                        code: ERROR_CODES.USER_ALREADY_INACTIVE,
                        message: t('users.already-inactive')
                    }
                ])
            );

        user.active = false;
        markSessionsEnded(user);
        return withTransaction((session) =>
            announceWithin(
                session,
                () => userRepository.save(user, session),
                (saved) => ({
                    name: USER_DEACTIVATED,
                    payload: { userId: String(saved._id) },
                    aggregateId: String(saved._id)
                })
            )
        ).then((saved) => {
            // After the commit, never inside: the relay reads what the transaction wrote.
            nudgeOutbox();
            recordAudit(context, {
                action: usersAuditActions.ADMIN_USER_BANNED,
                outcome: 'success',
                targetType: 'user',
                targetId: id
            });
            // Deactivation is a product event as well as an administrative one: it is what a churn
            // dashboard counts, and it is invisible in a plain "updated" signal.
            emitAnalyticsEvent({
                // The admin's event, no target id: see `create.ts`.
                ...buildAnalyticsBase(context),
                event: usersAnalyticsEvents.USER_DEACTIVATED
            });
            return generateSuccess(saved, 200, t('users.deactivated'));
        });
    });
