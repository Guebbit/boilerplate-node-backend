/**
 * @module
 * "Load the caller's own account, or answer 401" — the opening every self-service flow shares. A
 * verified token for a since-deleted account is unauthenticated, not a 404: the contract declares
 * no 404 on these routes, and `isAuth` treats the same case (token valid, user gone) as 401.
 */

import {
    generateReject,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import type { CallerContext } from '@types';
import { userService, type UserDocument } from '@modules/users';
import { isUnrestrictedCaller } from '../roles';

/**
 * Run `action` on the caller's own account.
 *
 * @param userId - the authenticated caller
 * @param action - what to do with the loaded account
 * @param load - how to load it; credentials included by default, since most flows save or verify
 *   against secrets that are `select: false`
 * @returns `action`'s answer, or 401 when the account is gone
 */
export const withOwnAccount = <T>(
    userId: string,
    action: (
        user: UserDocument
    ) => ResponseSuccess<T> | ResponseReject | Promise<ResponseSuccess<T> | ResponseReject>,
    load: (id: string) => Promise<UserDocument | null> = userService.findByIdWithCredentials
): Promise<ResponseSuccess<T> | ResponseReject> =>
    load(userId).then((user) => (user ? action(user) : generateReject(401, [])));

/**
 * Record an audit entry about an account's own action, naming the actor's role the way every
 * account audit does: `admin` for an unrestricted membership, `user` otherwise. The role is read
 * fresh, after whatever the action just changed (a verification promotes `unverified` to `customer`),
 * never trusted off a value computed before it.
 *
 * @param context - the caller context
 * @param userId - the account the action belongs to; also the entry's actor
 * @param entry - the rest of the audit entry
 */
export const recordAccountAudit = (
    context: CallerContext,
    userId: string,
    entry: Omit<Parameters<typeof recordAudit>[1], 'actorUserId' | 'actorRole'>
): Promise<void> =>
    isUnrestrictedCaller(userId).then((unrestricted) => {
        recordAudit(context, {
            ...entry,
            actorUserId: userId,
            actorRole: unrestricted ? 'admin' : 'user'
        });
    });
