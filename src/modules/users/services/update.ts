/**
 * @module
 * Admin-side user update: field assignment, role change, save-and-react, and the audit row.
 */

import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { encryptPii } from '@infrastructure/security/pii-encryption';
import { imageStore, applyImageWriteback } from '@infrastructure/adapters/image-store';
import { clearedOrValue } from '@infrastructure/persistence/changes';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import type { AuditAction } from '@infrastructure/observability/audit';
import type { CallerContext, UpdateUserByIdRequest, WithServerImage } from '@types';
import { assignRole, assertCanGrant, rolesOf } from '@modules/access';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { TokenType } from '../model';
import type { UserDocument } from '../model';
import { userRepository } from '../repository';
import { usersAnalyticsEvents } from '../analytics';
import { usersAuditActions } from '../audit';
import { enqueueIfPending } from './image';

/**
 * Update an existing user document. Returns a result envelope instead of throwing, the protocol
 * every service here follows. Typed off `UpdateUserByIdRequest` rather than a hand-picked `Pick`:
 * the old hand-picked list was missing `active`, so `active: false` fired `USER_DEACTIVATED`
 * without ever writing the field.
 */
export const update = (
    user: UserDocument,
    data: WithServerImage<UpdateUserByIdRequest> & {
        /** Not on `UpdateUserByIdRequest` — `readOnly` on the contract, set only by the server. */
        thumbnailUrl?: string;
        /** Set alongside a new pending-image placeholder — see `readUploadedImage`. */
        pendingImageKey?: string;
        /**
         * Not on `UpdateUserByIdRequest` either — consent is `account`'s own self-service field
         * (`UpdateAccountRequest`), deliberately absent from the ADMIN `/users/:id` contract:
         * consent is the data subject's to give, never an operator's to set on their behalf.
         * Rides along the same way `thumbnailUrl` does, from the one caller (`account`'s
         * `updateProfile`) that actually has one to pass.
         */
        analyticsConsent?: boolean;
    },
    /**
     * The caller MAKING the change, passed on to `assignRole` as its `granter` — the keys behind
     * `data.role` must be a subset of the keys behind this. Without it a role editor is a
     * privilege-escalation endpoint: any caller who can reach this function at all could grant
     * any role, including their own promotion to `owner`.
     */
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    if (data.username !== undefined) user.username = data.username;
    // `role` is not written here — there is no column, only the membership,
    // written below in `updateSavedUser` once the rest of the document has saved.
    if (data.active !== undefined) user.active = data.active;
    // The old url is captured before the overwrite so `updateSavedUser` can delete it once
    // the new one is durably saved — see `applyImageWriteback`'s own docblock for the gate
    // shared with `products/services/crud.ts`'s own `update`. `null` unsets the field, and the
    // same old-url capture then deletes the file and its thumbnail.
    const oldImageUrl = applyImageWriteback(user, data);
    // The preference that outlives the request — see the `locale` field on the user
    // schema. `null` clears the override — $unset on save.
    if (data.locale !== undefined) user.locale = clearedOrValue(data.locale);
    if (data.phone !== undefined)
        user.phone = data.phone === null ? undefined : encryptPii(data.phone);
    if (data.website !== undefined) user.website = clearedOrValue(data.website);
    // Absent leaves the stored choice alone, same as every field above; only an explicit
    // boolean changes it.
    if (data.analyticsConsent !== undefined) user.analyticsConsent = data.analyticsConsent;

    return updateSavedUser(user, data, context, oldImageUrl);
};

/**
 * The role an update actually changes to, or `undefined` when it changes nothing.
 *
 * A PUT carries `role` every time (RFC 9110 §9.3.4), so "present" is not "changed". Re-granting
 * the role already held would refuse a caller allowed to edit this user but never to grant that
 * role — support editing a customer — and would audit a role change that never happened.
 *
 * @param user - the loaded document, before its membership is touched
 * @param requested - `data.role` as the request sent it
 * @returns the role to grant, or `undefined` for none
 */
const changedRole = (user: UserDocument, requested?: string): Promise<string | undefined> =>
    requested === undefined
        ? Promise.resolve(undefined)
        : rolesOf(String(user._id), DEPLOYMENT_TENANT_ID).then(({ tenant }) =>
              // Stored lower-cased and trimmed — the membership schema's own normalisation.
              tenant === requested.trim().toLowerCase() ? undefined : requested
          );

/**
 * The save-and-react half of {@link update}, split out so the breach check above it reads as one
 * idea rather than the start of an even longer function.
 *
 * @param oldImageUrl - the image the update just replaced, or `undefined` when the avatar was
 *   not touched. Deleted only after the save succeeds — bytes removed ahead of a write that then
 *   fails would leave a row pointing at a 404.
 */
const updateSavedUser = (
    user: UserDocument,
    data: Pick<UpdateUserByIdRequest, 'active' | 'role'>,
    context: CallerContext,
    oldImageUrl?: string
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    changedRole(user, data.role).then((role) =>
        saveWithRole(user, { active: data.active, role }, context, oldImageUrl)
    );

/**
 * {@link updateSavedUser} once the role is known to be a real change (or none): check the grant,
 * save, then revoke sessions, write the membership and clean up the old avatar.
 *
 * @param data - `role` here is {@link changedRole}'s answer, never the raw request's
 */
const saveWithRole = (
    user: UserDocument,
    data: Pick<UpdateUserByIdRequest, 'active' | 'role'>,
    context: CallerContext,
    oldImageUrl?: string
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    // Validated BEFORE anything is written: a refused role change must not leave the rest of the
    // update — a deactivation included — committed underneath a request that, as a whole, failed.
    // `assertCanGrant` runs the same checks `assignRole` below does; asking first costs one more
    // in-memory pass, never a round trip, since the escalation rule needs no database read.
    const grantChecked =
        data.role === undefined
            ? Promise.resolve()
            : Promise.resolve().then(() =>
                  assertCanGrant('tenant', data.role!, context.caller.permissions)
              );

    return grantChecked
        .then(() => {
            // The role lives in the membership, not on this document, so a role-only edit changes
            // nothing Mongoose would write — and the user's version (its ETag, `editRevision`) would
            // stay put while the role moved. Marking the stamp modified makes `save()` move it, and
            // fence the write, so two admins holding the same tag cannot both change the role.
            if (data.role !== undefined) user.markModified('updatedAt');
            return userRepository.save(user);
        })
        .then((savedUser) => {
            // Only after the save: the old avatar is unreachable the moment the field is overwritten.
            const imageCleanup: Promise<void> = oldImageUrl
                ? imageStore.remove(oldImageUrl).then(() => undefined)
                : Promise.resolve();

            // Deactivation ends every live session. Defense in depth on top of
            // `findAuthenticatableById`, which already blocks a deactivated account's next
            // request — this also makes `GET /account/sessions` honest and drops credentials with
            // no live account behind them. Swallowed on failure: a revoke that doesn't reach every
            // token must not turn an otherwise-successful deactivation into a reported failure.
            const revoke =
                data.active === false
                    ? savedUser.tokenRemoveAll(TokenType.REFRESH).catch(() => undefined)
                    : Promise.resolve();

            // Already validated above, so this should only ever resolve — `assignRole` is kept as
            // the one place that WRITES the membership, rather than duplicating its upsert here.
            const membership =
                data.role === undefined
                    ? Promise.resolve()
                    : assignRole(
                          String(savedUser._id),
                          DEPLOYMENT_TENANT_ID,
                          'tenant',
                          data.role,
                          context.caller.permissions,
                          context
                      ).then(() => undefined);

            return revoke
                .then(() => membership)
                .then(() => imageCleanup)
                .then(() => enqueueIfPending(savedUser))
                .then(generateSuccess);
        });
};

/**
 * Which admin action an update represents: a ban, its reversal, or an ordinary edit — the
 * distinction the history is for. `active` is `undefined` when the request never mentions the
 * field, same as every other optional column `update()` handles; `wasActive` is `undefined` only
 * when the type carries the contract's optionality rather than a loaded row's real state, so it
 * falls back to the schema's own default rather than reporting a ban on a guess.
 */
const auditActionForUpdate = (wasActive: boolean | undefined, active?: boolean): AuditAction => {
    if (active === undefined || active === (wasActive ?? true))
        return usersAuditActions.ADMIN_USER_UPDATED;
    return active ? usersAuditActions.ADMIN_USER_UNBANNED : usersAuditActions.ADMIN_USER_BANNED;
};

/** Update an existing user by ID. Fetches the document then delegates to update(). */
export const updateById = (
    id: string,
    // `thumbnailUrl`/`pendingImageKey`: not on the contract, server-derived — see `update()`'s
    // own docblock for why each rides along the same way.
    data: WithServerImage<UpdateUserByIdRequest> & {
        thumbnailUrl?: string;
        pendingImageKey?: string;
    },
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    // Credentials included: `data.password`, when present, is assigned onto this document.
    userRepository.findByIdWithCredentials(id).then((user) => {
        // Returned, not thrown: a thrown miss is indistinguishable from a genuine database error
        // at the `.catch()` that has to tell them apart.
        if (!user) return generateReject(404, [t('users.not-found')]);

        // Read before `update()` mutates `user.active` in place — the flip is the whole signal.
        const wasActive = user.active;

        return update(user, data, context).then((result) => {
            if (result.success) {
                recordAudit(context, {
                    action: auditActionForUpdate(wasActive, data.active),
                    outcome: 'success',
                    target_type: 'user',
                    target_id: id
                });
                // Deactivation is a product event as well as an administrative one: it is what a
                // churn dashboard counts, and it is invisible in a plain "updated" signal. Only on
                // the flip — a PUT resends `active: false` on every save of a deactivated user.
                if (data.active === false && wasActive !== false)
                    emitAnalyticsEvent({
                        ...buildAnalyticsBase(context),
                        distinctId: id,
                        event: usersAnalyticsEvents.USER_DEACTIVATED
                    });
            }
            return result;
        });
    });
