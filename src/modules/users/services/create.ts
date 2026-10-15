/**
 * @module
 * Admin-side user creation: the owner-chosen password, the role grant, the audit trail.
 */

import { randomBytes } from 'node:crypto';
import {
    generateSuccess,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { announceInTransaction } from '@kernel/outbox';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import type { CallerContext, CreateUserRequest, WithServerImage } from '@types';
import {
    assertCanGrantAudited,
    assignRole,
    auditRoleAssigned,
    VERIFIED_CUSTOMER_ROLE
} from '@modules/access';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import type { UserDocument } from '../model';
import { userRepository } from '../repository';
import { usersAnalyticsEvents } from '../analytics';
import { usersAuditActions } from '../audit';
import { USER_SETUP_REQUESTED } from '../events';
import { enqueueIfPending } from './image';

/**
 * Create a new user document — no email confirmation step; that self-service path is
 * `accountService.signup`.
 *
 * - `verifiedAt`: hardcoded `now` — an operator typing the address in IS the vouching
 *   (`shared/authorization-roles.yaml`'s role grants are the same act).
 * - Password: never supplied. A credential is its owner's alone, so the account starts with a
 *   random value nobody is told, and `USER_SETUP_REQUESTED` (on the outbox, in the same
 *   transaction as the account) mails the owner a link to choose
 *   their own (`POST /account/reset-confirm`).
 * - Typed off `CreateUserRequest`, not a hand-picked `Pick`: a hand-copied list is what silently
 *   dropped `active` from `update()` below.
 * - The account and its role grant are ONE transaction, the grant checked (and a refusal audited)
 *   before any write. See docs/modules/users.md#creating-and-updating-with-a-role.
 * - Returns a result envelope, same protocol `update` follows.
 */
export const create = (
    data: WithServerImage<CreateUserRequest>,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    // 32 random bytes as hex, same as `tokenAdd` below uses for a reset token: unguessable and
    // never surfaced anywhere, so "unusable until the owner sets one" is enforced by nobody
    // knowing it.
    const password = randomBytes(32).toString('hex');
    // An operator typing the address in is the vouching, same reasoning as `verifiedAt` above.
    const role = data.role ?? VERIFIED_CUSTOMER_ROLE;

    return Promise.resolve()
        .then(() =>
            // Checked, and a refusal audited, BEFORE anything is written: an escalation attempt
            // must leave its row without ever having made a user.
            assertCanGrantAudited('tenant', role, context.caller.permissions, context)
        )
        .then(() =>
            // The account, its membership and the setup-mail event commit together or not at
            // all: a failure between them leaves nothing behind to undo, so no compensating
            // delete (which could itself fail) is needed, and a refused grant leaves no event.
            // https://www.mongodb.com/docs/manual/core/transactions/
            announceInTransaction(
                (session) =>
                    userRepository
                        .create(
                            {
                                verifiedAt: new Date(),
                                ...data,
                                // `null` on a create means no image: the schema default applies to `undefined` only.
                                imageUrl: data.imageUrl ?? undefined,
                                password
                            },
                            session
                        )
                        // The membership is the ONLY grant — there is no column beside it.
                        .then((user) =>
                            assignRole(
                                String(user._id),
                                DEPLOYMENT_TENANT_ID,
                                'tenant',
                                role,
                                context.caller.permissions,
                                context,
                                session
                            ).then(() => user)
                        ),
                (user) => ({
                    name: USER_SETUP_REQUESTED,
                    payload: { userId: String(user._id) },
                    aggregateId: String(user._id)
                })
            )
        )
        .then((user) => {
            // Only now that the transaction has committed is the grant true to audit.
            auditRoleAssigned(context, String(user._id), role, DEPLOYMENT_TENANT_ID, 'tenant');
            return user;
        })
        .then((user) => {
            recordAudit(context, {
                action: usersAuditActions.ADMIN_USER_CREATED,
                outcome: 'success',
                targetType: 'user',
                targetId: String(user._id)
            });
            emitAnalyticsEvent({
                ...buildAnalyticsBase(context),
                // The new user, not the admin who created it — the funnel counts who came into
                // existence, not who did the typing.
                distinctId: String(user._id),
                event: usersAnalyticsEvents.USER_CREATED,
                properties: { admin_created: true }
            });

            return enqueueIfPending(user);
        })
        .then((user) => generateSuccess(user, 201));
};
