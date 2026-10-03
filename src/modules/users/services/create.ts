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
import { emitDomainEvent } from '@kernel/events';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import type { CallerContext, CreateUserRequest, WithServerImage } from '@types';
import { assignRole, VERIFIED_CUSTOMER_ROLE } from '@modules/access';
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
 *   random value nobody is told, and `USER_SETUP_REQUESTED` mails the owner a link to choose
 *   their own (`POST /account/reset-confirm`).
 * - Typed off `CreateUserRequest`, not a hand-picked `Pick`: a hand-copied list is what silently
 *   dropped `active` from `update()` below.
 * - Returns a result envelope, same protocol `update` follows.
 */
export const create = (
    data: WithServerImage<CreateUserRequest> & {
        /** Set alongside the pending-image placeholder — see `readUploadedImage`. */
        pendingImageKey?: string;
    },
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    // 32 random bytes as hex, same as `tokenAdd` below uses for a reset token: unguessable and
    // never surfaced anywhere, so "unusable until the owner sets one" is enforced by nobody
    // knowing it.
    const password = randomBytes(32).toString('hex');
    // An operator typing the address in is the vouching, same reasoning as `verifiedAt` above.
    const role = data.role ?? VERIFIED_CUSTOMER_ROLE;

    return userRepository
        .create({
            verifiedAt: new Date(),
            ...data,
            // `null` on a create means no image: the schema default applies to `undefined` only.
            imageUrl: data.imageUrl ?? undefined,
            password
        })
        .then((user) =>
            /*
             * The membership is the ONLY grant — there is no column beside it.
             * Awaited before the audit event: a rejected escalation must fail the whole create,
             * not just a column that already saved. `assignRole` is passed `context` so a
             * refused escalation is itself audited (the single most useful entry this
             * vocabulary can produce) — which is also why the fix for the orphan row below is a
             * compensating delete rather than validating ahead of the write: doing that would
             * skip `assignRole` (and its audit) entirely on a caller who was always going to fail.
             */
            assignRole(
                String(user._id),
                DEPLOYMENT_TENANT_ID,
                'tenant',
                role,
                context.caller.permissions,
                context
            ).then(
                () => user,
                (error: unknown) =>
                    userRepository.deleteOne(user).then(() => {
                        throw error;
                    })
            )
        )
        .then((user) => {
            recordAudit(context, {
                action: usersAuditActions.ADMIN_USER_CREATED,
                outcome: 'success',
                target_type: 'user',
                target_id: String(user._id)
            });
            emitAnalyticsEvent({
                ...buildAnalyticsBase(context),
                // The new user, not the admin who created it — the funnel counts who came into
                // existence, not who did the typing.
                distinctId: String(user._id),
                event: usersAnalyticsEvents.USER_CREATED,
                properties: { admin_created: true }
            });

            return enqueueIfPending(user).then((pending) =>
                emitDomainEvent(USER_SETUP_REQUESTED, {
                    userId: String(pending._id)
                }).then(() => pending)
            );
        })
        .then((user) => generateSuccess(user, 201));
};
