/**
 * @module
 * Admin-side user update: field assignment, role change, save-and-react, and the audit row.
 */

import type { ClientSession } from 'mongoose';
import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { heldRules } from '@kernel/ability';
import { encryptPii } from '@infrastructure/security/pii-encryption';
import { imageStore, applyImageWriteback } from '@infrastructure/adapters/image-store';
import { clearedOrValue } from '@infrastructure/persistence/changes';
import { rearmPrecondition } from '@infrastructure/persistence/versioning';
import { withTransaction } from '@infrastructure/runtime/database';
import { announceWithin, nudgeOutbox } from '@kernel/outbox';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import { auditForbidden } from '@infrastructure/observability/forbidden';
import type { AuditAction } from '@infrastructure/observability/audit';
import type { CallerContext, UpdateUserByIdRequest, WithServerImage } from '@types';
import { accessService } from '@modules/access';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { phoneAad, type UserDocument } from '../model';
import { userRepository } from '../repository';
import { usersAnalyticsEvents } from '../analytics';
import { usersAuditActions } from '../audit';
import { USER_DEACTIVATED } from '../events';
import { markSessionsEnded } from './credentials';
import { enqueueIfPending } from './image';
import { roleRefusalReject } from './role-refusal';

/**
 * Update an existing user document. Returns a result envelope instead of throwing, the protocol
 * every service here follows. Typed off `UpdateUserByIdRequest` rather than a hand-picked `Pick`:
 * a hand-picked list can miss `active`, which would fire `USER_DEACTIVATED` without ever
 * writing the field.
 */
export const update = (
    user: UserDocument,
    data: WithServerImage<Omit<UpdateUserByIdRequest, 'role'>> & {
        /**
         * Not on `UpdateUserByIdRequest` either — consent is `account`'s own self-service field
         * (`UpdateAccountRequest`), deliberately absent from the ADMIN `/users/:id` contract:
         * consent is the data subject's to give, never an operator's to set on their behalf.
         * Rides along the same way the image fields do, from the one caller (`account`'s
         * `updateProfile`) that actually has one to pass.
         */
        analyticsConsent?: boolean;
    },
    /**
     * The caller MAKING the change, passed on to `assignRole` as its `granter` — the keys behind
     * `data.role` must be a subset of the keys behind this. Without it a role editor is a
     * privilege-escalation endpoint: any caller who can reach this function at all could grant
     * any role, including their own promotion to `admin`.
     */
    context: CallerContext,
    /** {@link changedRole}'s answer: the role to grant, `null` to take it away, `undefined` for no change. */
    role?: RoleChange
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    let banned = false;
    if (data.username !== undefined) user.username = data.username;
    // `role` is not written here — there is no column, only the membership,
    // written below in `saveWithRole` once the rest of the document has saved.
    if (data.active !== undefined) {
        // A ban ends every session in the SAME save: the `active` gate alone would let the old
        // tokens back in the moment someone unbans the account.
        banned = !data.active && Boolean(user.active);
        if (banned) markSessionsEnded(user);
        user.active = data.active;
    }
    // The old url is captured before the overwrite so the save can delete it once
    // the new one is durably saved — see `applyImageWriteback`'s own docblock for the gate
    // shared with `products/services/crud.ts`'s own `update`. `null` unsets the field, and the
    // same old-url capture then deletes the file and its thumbnail.
    const oldImageUrl = applyImageWriteback(user, data);
    // The preference that outlives the request — see the `locale` field on the user
    // schema. `null` clears the override — $unset on save.
    if (data.locale !== undefined) user.locale = clearedOrValue(data.locale);
    if (data.phone !== undefined)
        user.phone = data.phone === null ? undefined : encryptPii(data.phone, phoneAad(user.id));
    if (data.website !== undefined) user.website = clearedOrValue(data.website);
    // Absent leaves the stored choice alone, same as every field above; only an explicit
    // boolean changes it. The date moves with the answer: the first one, or a different one.
    if (
        data.analyticsConsent !== undefined &&
        (user.analyticsConsentAt === undefined || data.analyticsConsent !== user.analyticsConsent)
    ) {
        user.analyticsConsent = data.analyticsConsent;
        user.analyticsConsentAt = new Date();
    }

    return saveWithRole(user, { active: data.active, banned, role }, context, oldImageUrl);
};

/**
 * What an update does to the staff role: grant one, take the held one away, or (`undefined`) leave
 * it alone. The revoke names the role it takes, for the audit row.
 */
type RoleChange = { grant: string } | { revoke: string } | undefined;

/**
 * Whether `requested` differs from the tenant role held. Held roles are stored lower-cased and
 * trimmed (the membership schema's own normalisation), so the request is compared that way too.
 *
 * @param held - the tenant role held now, `null` for none
 * @param requested - the role the request names, `null` for "no staff role"
 */
const roleDiffers = (held: string | null, requested: string | null): boolean =>
    held !== (requested?.trim().toLowerCase() ?? null);

/**
 * The role change an update actually makes, or `undefined` when it changes nothing.
 *
 * A PUT carries `role` every time (RFC 9110 §9.3.4), so "present" is not "changed". Re-granting
 * the role already held would refuse a caller allowed to edit this user but never to grant that
 * role — support editing a customer — and would audit a role change that never happened. `null`
 * means "no staff role", so it changes nothing for an account that holds none.
 *
 * @param user - the loaded document, before its membership is touched
 * @param requested - `data.role` as the request sent it
 * @returns the change to make, or `undefined` for none
 */
const changedRole = (user: UserDocument, requested?: string | null): Promise<RoleChange> =>
    requested === undefined
        ? Promise.resolve(undefined)
        : accessService.rolesOf(String(user._id), DEPLOYMENT_TENANT_ID).then(({ tenant }) => {
              if (!roleDiffers(tenant, requested)) return undefined;

              return requested === null ? { revoke: tenant ?? '' } : { grant: requested };
          });

/**
 * Whether an edit would change who holds powers: the staff role, or a ban or unban. Judged on the
 * id and the body alone, the way the route asks BEFORE the controller runs, to decide whether the
 * caller owes a fresh login. The same comparison {@link changedRole} makes, so the two cannot
 * disagree. A PUT carries `role` and `active` every time, so only a value that differs from the
 * stored one counts.
 *
 * @param id - the account about to be edited
 * @param body - `role` and `active` as the request sent them
 * @returns `false` for nothing sent or nothing different (and for an unknown account, which the
 *   controller answers 404); `true` for a role granted or removed, or an active flag flipped
 */
export const powersChangeRequested = (
    id: string,
    body: { role?: string | null; active?: boolean | string } | undefined
): Promise<boolean> =>
    userRepository.findById(id).then((user) => {
        if (!user) return false;
        // A multipart body is read before validation turns its strings into booleans.
        const active = typeof body?.active === 'string' ? body.active === 'true' : body?.active;
        if (active !== undefined && active !== user.active) return true;
        if (body?.role === undefined) return false;

        return accessService
            .rolesOf(id, DEPLOYMENT_TENANT_ID)
            .then(({ tenant }) => roleDiffers(tenant, body.role!));
    });

/**
 * The membership half of {@link saveAndGrant}: grant the role, take it away, or do nothing.
 *
 * @param id - the account
 * @param role - {@link changedRole}'s answer
 * @param context - the caller, whose keys bound the role they may grant
 * @param session - the transaction the write joins
 */
const writeRole = (
    id: string,
    role: RoleChange,
    context: CallerContext,
    session: ClientSession
): Promise<unknown> => {
    if (role === undefined) return Promise.resolve();
    if ('revoke' in role)
        return accessService.revokeRole(id, DEPLOYMENT_TENANT_ID, 'tenant', context, session);

    return accessService.assignRole(
        id,
        DEPLOYMENT_TENANT_ID,
        'tenant',
        role.grant,
        context.caller.permissions,
        context,
        session
    );
};

/**
 * The write half of an update, inside the caller's transaction: the document's save and, for a
 * real role change, the membership write — both or neither.
 *
 * @param user - the loaded, already-mutated document
 * @param role - {@link changedRole}'s answer, never the raw request's
 * @param banned - whether this save is the ban, which commits `user.deactivated` with it
 * @param context - the caller, whose keys bound the role they may grant
 * @param session - the transaction both writes join
 */
const saveAndGrant = (
    user: UserDocument,
    role: RoleChange,
    banned: boolean,
    context: CallerContext,
    session: ClientSession
): Promise<UserDocument> => {
    // The transaction may re-run this on a transient conflict: each attempt checks the caller's
    // `If-Match` against the row it holds, instead of the first attempt's having used it up.
    rearmPrecondition();

    // The role lives in the membership, not on this document, so a role-only edit changes
    // nothing Mongoose would write — and the user's version (its ETag, `editRevision`) would
    // stay put while the role moved. Marking the stamp modified makes `save()` move it, and
    // fence the write, so two admins holding the same tag cannot both change the role.
    if (role !== undefined) user.markModified('updatedAt');

    return announceWithin(
        session,
        () =>
            userRepository
                .save(user, session)
                .then((saved) =>
                    writeRole(String(saved._id), role, context, session).then(() => saved)
                ),
        // The ban commits with its announcement or not at all, so the links are purged exactly when
        // the sessions died. An ordinary edit announces nothing.
        (saved) =>
            banned
                ? {
                      name: USER_DEACTIVATED,
                      payload: { userId: String(saved._id) },
                      aggregateId: String(saved._id)
                  }
                : []
    );
};

/**
 * What follows a committed update: the new avatar's cleanup and the role grant's audit row. A ban
 * ends every session in the update's own save (`markSessionsEnded`); the one-time links it leaves
 * are purged by `account`, on `user.deactivated`.
 *
 * @param savedUser - the committed document
 * @param data - `role` here is {@link changedRole}'s answer; `active` the request's
 * @param context - the caller
 * @param oldImageUrl - the image the update replaced, or `undefined` when the avatar was not touched
 */
const finishUpdate = (
    savedUser: UserDocument,
    data: Pick<UpdateUserByIdRequest, 'active'> & { role: RoleChange },
    context: CallerContext,
    oldImageUrl?: string
): Promise<ResponseSuccess<UserDocument>> => {
    // Only after the commit: the old avatar is unreachable the moment the field is overwritten.
    const imageCleanup: Promise<void> = oldImageUrl
        ? imageStore.remove(oldImageUrl).then(() => undefined)
        : Promise.resolve();

    // The change is true only now: it committed with the document.
    if (data.role && 'grant' in data.role)
        accessService.auditRoleAssigned(
            context,
            String(savedUser._id),
            data.role.grant,
            DEPLOYMENT_TENANT_ID,
            'tenant'
        );
    else if (data.role)
        accessService.auditRoleRevoked(
            context,
            String(savedUser._id),
            data.role.revoke,
            DEPLOYMENT_TENANT_ID,
            'tenant'
        );

    return imageCleanup.then(() => enqueueIfPending(savedUser)).then(generateSuccess);
};

/**
 * {@link update} once the role is known to be a real change (or none): check the grant
 * and audit a refusal, write the document and the membership in one transaction, then clean up.
 *
 * @param data - `role` here is {@link changedRole}'s answer, never the raw request's
 */
const saveWithRole = (
    user: UserDocument,
    data: Pick<UpdateUserByIdRequest, 'active'> & { banned: boolean; role: RoleChange },
    context: CallerContext,
    oldImageUrl?: string
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    // Validated BEFORE anything is written, and a refusal audited: a refused role change
    // must not leave the rest of the update — a deactivation included — committed
    // underneath a request that, as a whole, failed. The escalation rule needs no
    // database read, so asking first costs one more in-memory pass.
    const refusal =
        data.role && 'grant' in data.role
            ? accessService.grantRefusalAudited(
                  'tenant',
                  data.role.grant,
                  context.caller.permissions,
                  context,
                  String(user._id)
              )
            : undefined;
    if (refusal) return Promise.resolve(roleRefusalReject(refusal));

    return Promise.resolve()
        .then(() =>
            withTransaction((session) =>
                saveAndGrant(user, data.role, data.banned, context, session)
            )
        )
        .then((savedUser) => {
            // After the commit, never inside: the relay reads what the transaction wrote.
            if (data.banned) nudgeOutbox();
            return finishUpdate(savedUser, data, context, oldImageUrl);
        });
};

/**
 * The key a writable field needs on top of the route's own `update:User` — the one
 * field-to-key map. Every other field (username, image, locale, phone, website, `role`) rides on
 * `update:User` alone; a body mixing fields needs every key its CHANGED fields need.
 */
const FIELD_RULES = { active: 'ban:User' } as const;

/**
 * The keys this update needs beyond the route's. A field counts only when it CHANGES: a PUT
 * carries `active` on every save, and resending the value an account already has is not a ban.
 *
 * @param user - the loaded document, before the update touches it
 * @param data - the request body
 */
const extraRulesNeeded = (
    user: UserDocument,
    data: Pick<UpdateUserByIdRequest, 'active'>
): string[] =>
    data.active !== undefined && data.active !== (user.active ?? true) ? [FIELD_RULES.active] : [];

/**
 * `403 FORBIDDEN` for a field the caller's keys do not cover, audited like the route guard's own
 * refusal — `requirePermission` can only ask about the route, never about the body.
 *
 * @param key - the missing key
 * @param id - the account the update was aimed at
 * @param context - the caller
 */
const missingKeyRefusal = (key: string, id: string, context: CallerContext): ResponseReject => {
    auditForbidden(context, {
        targetType: 'user',
        targetId: id,
        metadata: { reason: 'missing_permission', permission: key }
    });

    return generateReject(403, [t('generic.error-forbidden')]);
};

/**
 * Everything an admin update must clear before a field is written, in order: the keys its
 * changed fields need, then the protection of an account that holds a staff role.
 *
 * @param user - the loaded document
 * @param data - the request body
 * @param context - the caller
 * @returns the refusal, or `undefined` to carry on
 */
const refusalFor = (
    user: UserDocument,
    data: Pick<UpdateUserByIdRequest, 'active'>,
    context: CallerContext
): Promise<ResponseReject | undefined> => {
    const id = String(user._id);
    const held = heldRules(context.caller);
    const missing = extraRulesNeeded(user, data).find((key) => !held.has(key));

    if (missing) return Promise.resolve(missingKeyRefusal(missing, id, context));

    return accessService.roleProtectedRefusal(context, id);
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

/** The shape of an admin update's data: the contract's body, plus the image fields the server decides. */
type UpdateByIdData = WithServerImage<UpdateUserByIdRequest>;

/**
 * The write half of {@link updateById}, once every refusal has been cleared: the update itself,
 * then its audit row and analytics event.
 *
 * @param user - the loaded document
 * @param data - the request body
 * @param context - the caller
 * @param wasActive - `user.active` read BEFORE `update()` mutates it in place — the flip is the
 *   whole signal for the ban/unban audit action and the deactivation event
 * @param role - {@link changedRole}'s answer for this request
 */
const applyUpdate = (
    user: UserDocument,
    data: UpdateByIdData,
    context: CallerContext,
    wasActive: boolean | undefined,
    role: RoleChange
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    update(user, data, context, role).then((result) => {
        if (result.success) {
            recordAudit(context, {
                action: auditActionForUpdate(wasActive, data.active),
                outcome: 'success',
                targetType: 'user',
                targetId: String(user._id)
            });
            // Deactivation is a product event as well as an administrative one: it is what a
            // churn dashboard counts, and it is invisible in a plain "updated" signal. Only on
            // the flip — a PUT resends `active: false` on every save of a deactivated user.
            if (data.active === false && wasActive !== false)
                emitAnalyticsEvent({
                    ...buildAnalyticsBase(context),
                    distinctId: String(user._id),
                    event: usersAnalyticsEvents.USER_DEACTIVATED
                });
        }
        return result;
    });

/**
 * Update an existing user by ID: load the document, clear the refusals ({@link refusalFor}),
 * then {@link applyUpdate}.
 *
 * @param id - the account being changed
 * @param data - the request body
 * @param context - the caller, whose keys decide what may change
 */
export const updateById = (
    id: string,
    data: UpdateByIdData,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    // The plain finder: an admin edit touches no credential, and the pending address is the
    // owner's to read (`GET /account`), so it stays unloaded and out of the answer.
    userRepository.findById(id).then((user) => {
        // Returned, not thrown: a thrown miss is indistinguishable from a genuine database error
        // at the `.catch()` that has to tell them apart.
        if (!user) return generateReject(404, [t('users.not-found')]);

        // Read before `update()` mutates `user.active` in place — the flip is the whole signal.
        const wasActive = user.active;

        // Once per request: the role the membership already holds is not a change.
        return changedRole(user, data.role).then((role) =>
            refusalFor(user, data, context).then(
                (refusal) => refusal ?? applyUpdate(user, data, context, wasActive, role)
            )
        );
    });
