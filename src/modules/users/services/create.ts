/**
 * @module
 * Admin-side user creation: the password rule, the role grant, the audit trail.
 */

import { randomBytes } from 'node:crypto';
import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { assertPasswordNotBreached } from '@infrastructure/security/breached-passwords';
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
import { nonBlankPassword } from './validation';
import { enqueueIfPending } from './image';

/**
 * Create a new user document — no email confirmation step; that self-service path is
 * `accountService.signup`.
 *
 * - `verifiedAt`: hardcoded `now` — an operator typing the address in IS the vouching
 *   (`shared/authorization-roles.yaml`'s "no unverified manager" rule).
 * - `password`: optional. Left out, a random value nobody is told fills the `required` field.
 *   Neither a password nor `sendSetupEmail: true` (which queues `USER_SETUP_REQUESTED` until a
 *   real one is set) is a 422 (`users.field-password-or-setup-required`), enforced HERE — not
 *   just in one controller, so every caller of this service trips the same rule.
 * - Typed off `CreateUserRequest`, not a hand-picked `Pick`: a hand-copied list is what silently
 *   dropped `active` from `update()` below.
 * - Returns a result envelope, same protocol `update` follows — a breached password fails the
 *   whole create, and the controller reads `result.success` rather than a thrown error.
 */
export const create = (
    data: WithServerImage<CreateUserRequest> & {
        /** Set alongside the pending-image placeholder — see `readUploadedImage`. */
        pendingImageKey?: string;
    },
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    const passwordProvided = nonBlankPassword(data.password);

    // Neither a password nor a way to get one to the user: `userRepository.create` below would
    // fill the field with a value nobody is ever told, and the account would be permanently
    // unusable. Enforced HERE, not just in one controller — every caller of this service must
    // trip the same rule.
    if (!passwordProvided && !data.sendSetupEmail)
        return Promise.resolve(generateReject(422, [t('users.field-password-or-setup-required')]));

    // Checked before anything is written — same rule `update` follows. Only ever run against an
    // OPERATOR-SUPPLIED password: the generated fallback just below is 32 random bytes, and
    // checking a value nobody chose against a breach list would only ever waste the round trip.
    return (
        passwordProvided ? assertPasswordNotBreached(data.password!) : Promise.resolve([])
    ).then((breachErrors) => {
        if (breachErrors.length > 0) return generateReject(422, breachErrors);

        // 32 random bytes as hex, same as `tokenAdd` below uses for a reset token: unguessable and
        // never surfaced anywhere, so "unusable until set" is enforced by nobody knowing it.
        const password = passwordProvided ? data.password! : randomBytes(32).toString('hex');
        // Matching the document field's old default, when an operator names none — an operator
        // typing the address in is the vouching, same reasoning as `verifiedAt` above.
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
                    target_id: String(user._id),
                    // Recorded here, not by `account`'s domain-event handler: that handler has no
                    // request to build a `CallerContext` from, only a `userId`, so the admin's
                    // action is the only point in the flow with someone to attribute it to.
                    ...(passwordProvided
                        ? {}
                        : { metadata: { sendSetupEmail: Boolean(data.sendSetupEmail) } })
                });
                emitAnalyticsEvent({
                    ...buildAnalyticsBase(context),
                    // The new user, not the admin who created it — the funnel counts who came into
                    // existence, not who did the typing.
                    distinctId: String(user._id),
                    event: usersAnalyticsEvents.USER_CREATED,
                    properties: { admin_created: true }
                });

                return enqueueIfPending(user).then((pending) => {
                    if (passwordProvided || !data.sendSetupEmail) return pending;

                    return emitDomainEvent(USER_SETUP_REQUESTED, {
                        userId: String(pending._id)
                    }).then(() => pending);
                });
            })
            .then((user) => generateSuccess(user, 201));
    });
};
