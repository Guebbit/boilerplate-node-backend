/**
 * @module
 * The User document: admin-facing CRUD and search, plus the named identity operations
 * `account` calls to authenticate, register, verify and 2FA-protect it — the `users` end of the
 * one shared-kernel relationship in this repo (`docs/theory/strategic-ddd.md` §5). Three regions,
 * in order below: admin CRUD/search, the identity operations, the inactivity reaper's own reads.
 * The flows themselves — HTTP, sessions, emails, rate limits, anti-automation — stay in `account`;
 * this file only ever enforces what the document itself requires.
 *
 * See: docs/modules/users.md
 */

import { randomBytes } from 'node:crypto';
import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject,
    type ResponseErrorItem,
    validationErrors
} from '@infrastructure/http/response';
import { assertPasswordNotBreached } from '@infrastructure/security/breached-passwords';
import { encryptPii } from '@infrastructure/security/pii-encryption';
import { imageStore } from '@infrastructure/adapters/image-store';
import { zodUserSchema, TokenType, hashToken, toUser } from './model';
import type { UserDocument, Token } from './model';
import type { CreateUserRequest, SearchUsersRequest, UpdateUserByIdRequest, User } from '@types';
import { userRepository } from './repository';
import { enqueueIfImagePending } from '@infrastructure/adapters/image.worker';
import { emitDomainEvent } from '@kernel/events';
import type { CallerContext } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import type { AuditAction } from '@infrastructure/observability/audit';
import { usersAnalyticsEvents } from './analytics';
import { usersAuditActions } from './audit';
import { USER_DELETED, USER_SETUP_REQUESTED } from './events';
import type { PaginatedMeta } from '@infrastructure/persistence/search';
import {
    assignRole,
    assertCanGrant,
    revokeAllOf,
    rolesOf,
    VERIFIED_CUSTOMER_ROLE
} from '@modules/access';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';

/**
 * Validate user data for admin create/edit forms; returns UI-friendly error messages (empty means
 * valid). Validates the WHOLE schema, not a `.pick()`: a pick would leave `admin`/`active`/
 * `imageUrl` unchecked, so a wrong-typed value would reach Mongoose and answer 500 instead of the
 * 422 the contract promises. Takes `unknown` since this is the boundary that establishes the type.
 */
export const validateData = (userData: unknown, requirePassword = true): ResponseErrorItem[] => {
    // `.strip()`: loosen only here, not on `zodUserSchema` itself. A PUT body legitimately
    // carries `id` — row identity, not user data — and `zodUserSchema` stays strict for its
    // other callers (signup, `PUT /account`), which must refuse a field their own contract
    // never declared.
    const schema = (
        requirePassword ? zodUserSchema : zodUserSchema.partial({ password: true })
    ).strip();

    const parseResult = schema.safeParse(userData);
    if (!parseResult.success) return validationErrors(parseResult.error);
    return [];
};

/**
 * Search users (DTO-friendly) — admin panel. No scope argument: `active` is an ordinary
 * searchable column, handled by the repository's `searchable.booleans` like any other filter,
 * independent of `deletedAt`.
 */
export const search = (
    filters: SearchUsersRequest = {}
): Promise<{
    items: UserDocument[];
    meta: PaginatedMeta;
}> => userRepository.search(filters);

/** Get a single user by ID. Returns undefined when no id is provided. */
export const getById = (id?: string): Promise<UserDocument | undefined> => {
    if (!id) return Promise.resolve(undefined);
    return userRepository.findById(id).then((user) => user ?? undefined);
};

/**
 * The contract `User` for an already-loaded document — resolves its CURRENT role fresh from the
 * membership store (the document holds none of its own) and applies `toUser` in one call, so a
 * controller does not chain the two itself. Single-document counterpart to `rolesOfMany` (see
 * `GET /users`'s own list read) — `get-user-item.ts` and `write-users.ts`'s create/update are the
 * three call sites this replaces.
 */
const toUserContract = (user: UserDocument): Promise<User> =>
    rolesOf(String(user._id), DEPLOYMENT_TENANT_ID).then((roles) => toUser(user, roles.tenant));

/**
 * Enqueue the digest job for a just-persisted user, when its write carried a pending upload.
 * `pendingImageKey` is only ever set while the queue looked ready at upload time — see
 * `quarantineUploadedImages`, and {@link enqueueIfImagePending} for what happens with it.
 */
export const enqueueIfPending = (user: UserDocument): Promise<UserDocument> =>
    enqueueIfImagePending(user, 'users', userRepository.writebackImage);

/**
 * Create a new user document, with no email confirmation step — the self-service path is
 * `accountService.signup`. `verifiedAt` is hardcoded `now` — an operator typing the address in is
 * the vouching (`shared/authorization-roles.yaml`'s "no unverified manager" rule). `password` is
 * optional: left out, a random value nobody is told fills the `required` field, and
 * `sendSetupEmail: true` queues a setup mail (`USER_SETUP_REQUESTED`) until a real one is set.
 * Typed off `CreateUserRequest` rather than a hand-picked `Pick`, since a hand-copied list is what
 * silently dropped `active` from `update()` below.
 */
export const create = (
    data: CreateUserRequest & {
        /** Set alongside the pending-image placeholder — see `readUploadedImage`. */
        pendingImageKey?: string;
    },
    context: CallerContext
): Promise<UserDocument> => {
    const passwordProvided = Boolean(data.password && data.password.trim().length > 0);
    // 32 random bytes as hex, same as `tokenAdd` below uses for a reset token: unguessable and
    // never surfaced anywhere, so "unusable until set" is enforced by nobody knowing it.
    const password =
        data.password && data.password.trim().length > 0
            ? data.password
            : randomBytes(32).toString('hex');
    // Matching the document field's old default, when an operator names none — an operator
    // typing the address in is the vouching, same reasoning as `verifiedAt` above.
    const role = data.role ?? VERIFIED_CUSTOMER_ROLE;

    return userRepository
        .create({ verifiedAt: new Date(), ...data, password })
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
            emitAuditEvent(
                buildAuditEvent(context, {
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
                })
            );
            emitAnalyticsEvent({
                ...buildAnalyticsBase(context),
                // The new user, not the admin who created it — the funnel counts who came into
                // existence, not who did the typing.
                distinctId: String(user._id),
                event: usersAnalyticsEvents.USER_CREATED,
                properties: { admin_created: true }
            });

            return enqueueIfPending(user).then(() => {
                if (passwordProvided || !data.sendSetupEmail) return user;

                return emitDomainEvent(USER_SETUP_REQUESTED, { userId: String(user._id) }).then(
                    () => user
                );
            });
        });
};

/**
 * Update an existing user document. Returns a result envelope instead of throwing, the protocol
 * every service here follows. Typed off `UpdateUserByIdRequest` rather than a hand-picked `Pick`:
 * the old hand-picked list was missing `active`, so `active: false` fired `USER_DEACTIVATED`
 * without ever writing the field.
 */
export const update = (
    user: UserDocument,
    data: UpdateUserByIdRequest & {
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
    const password = data.password && data.password.trim().length > 0 ? data.password : undefined;

    // Checked before any field is assigned: a breached password fails the whole update, and
    // nothing else here is worth mutating first.
    return (password ? assertPasswordNotBreached(password) : Promise.resolve([])).then(
        (breachErrors) => {
            if (breachErrors.length > 0) return generateReject(422, breachErrors);

            if (data.email !== undefined) user.email = data.email;
            if (data.username !== undefined) user.username = data.username;
            // `role` is not written here — there is no column, only the membership,
            // written below in `updateSavedUser` once the rest of the document has saved.
            if (data.active !== undefined) user.active = data.active;
            // The three travel as one unit, all produced by the same `readUploadedImage` call on
            // the controller — set together whenever a new upload replaces the image. The old url
            // is captured before the overwrite so `updateSavedUser` can delete it once the new one
            // is durably saved — mirrors `products/service.ts`'s `update`.
            const oldImageUrl = user.imageUrl;
            const imageReplaced = Boolean(data.imageUrl) && oldImageUrl !== data.imageUrl;
            if (data.imageUrl !== undefined) {
                user.imageUrl = data.imageUrl;
                user.thumbnailUrl = data.thumbnailUrl;
                user.pendingImageKey = data.pendingImageKey;
            }
            // The preference that outlives the request — see the `locale` field on the user schema.
            if (data.locale !== undefined) user.locale = data.locale;
            if (data.phone !== undefined) user.phone = encryptPii(data.phone);
            if (data.website !== undefined) user.website = data.website;
            // Absent leaves the stored choice alone, same as every field above; only an explicit
            // boolean changes it.
            if (data.analyticsConsent !== undefined) user.analyticsConsent = data.analyticsConsent;
            if (password) user.password = password;

            return updateSavedUser(user, data, context, imageReplaced ? oldImageUrl : undefined);
        }
    );
};

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
        .then(() => userRepository.save(user))
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
    data: UpdateUserByIdRequest & { pendingImageKey?: string },
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
                emitAuditEvent(
                    buildAuditEvent(context, {
                        action: auditActionForUpdate(wasActive, data.active),
                        outcome: 'success',
                        target_type: 'user',
                        target_id: id
                    })
                );
                // Deactivation is a product event as well as an administrative one: it is what a
                // churn dashboard counts, and it is invisible in a plain "updated" signal.
                if (data.active === false)
                    emitAnalyticsEvent({
                        ...buildAnalyticsBase(context),
                        distinctId: id,
                        event: usersAnalyticsEvents.USER_DEACTIVATED
                    });
            }
            return result;
        });
    });

/**
 * Remove a user document (soft or hard delete). Soft delete toggles `deletedAt` (restores if
 * already soft-deleted). A hard delete first revokes EVERY membership the account holds —
 * `revokeAllOf`, not a single tenant-scoped `revokeRole`: an account can hold a platform seat
 * alongside its tenant one, and either row surviving the user it points at is an erasure gap.
 * Only then does it emit `user.deleted`, awaited before the write, so cart cleanup happens
 * without this module knowing the cart exists — keeping the dependency arrow pointing
 * cart → users. Only the hard path touches either, since a soft delete is a restore waiting to
 * happen.
 */
export const remove = (
    user: UserDocument,
    hardDelete = false
): Promise<ResponseSuccess<UserDocument> | ResponseSuccess<undefined> | ResponseReject> => {
    if (hardDelete)
        return revokeAllOf(user.id)
            .then(() => emitDomainEvent(USER_DELETED, { userId: user.id }))
            .then(() => userRepository.deleteOne(user))
            .then(() => imageStore.remove(user.imageUrl))
            .then(() => generateSuccess(undefined, 200, t('users.hard-deleted')));

    // A FLIP, not an assignment: run against an already soft-deleted user this restores it,
    // which is what the `hardDelete: false` half of `hardDeleteSchema` means.
    const isNewSoftDelete = !user.deletedAt;
    user.deletedAt = user.deletedAt ? undefined : new Date();
    return userRepository.save(user).then((saved) => {
        // Soft delete revokes every refresh token too — same defense-in-depth reasoning as
        // `update`'s deactivation branch above. Only on the delete half of the flip: a restore
        // should not log anyone out.
        const revoke = isNewSoftDelete
            ? saved.tokenRemoveAll(TokenType.REFRESH).catch(() => undefined)
            : Promise.resolve();
        return revoke.then(() => generateSuccess(saved, 200, t('users.soft-deleted')));
    });
};

/**
 * Find a user by email address.
 * Returns the document if found, or undefined if no match.
 */
export const findByEmail = (email: string): Promise<UserDocument | undefined | null> =>
    // Credentials included: both callers (reset-request, delete-request) immediately push a
    // token onto the document, which `select: false` would otherwise leave undefined.
    userRepository.findOneWithCredentials({ email });

/**
 * Remove the given token from the user document and persist it — used to consume a one-time
 * password-reset token after the reset completes. An atomic `$pull`, not read-modify-write:
 * `POST /account/reset-confirm` saves the document twice (password, then this), so two
 * simultaneous confirms of one token both loaded version V and a read-modify-write would raise a
 * `VersionError` (500) on a request that had, in fact, already worked. `$pull` at write time
 * makes a second consume a no-op instead.
 *
 * @param user - the loaded document, kept in step with the write for callers that read it back
 * @param token - the token value to spend
 */
export const consumeToken = (user: UserDocument, token: string): Promise<boolean> =>
    userRepository.tokenRemove(user.id, token).then(({ modifiedCount }) => {
        // `tokens[].token` is hashed at rest — hash `token` the same way to resync
        // the loaded document's local copy after the DB `$pull`.
        const digest = hashToken(token);
        user.tokens = user.tokens.filter((tk) => tk.token !== digest);
        // `true` only for the caller whose write actually removed it. Two simultaneous uses of one
        // reset link both pass the earlier "does this token exist" read, so this is the only
        // point at which they can be told apart — see `postResetConfirm`.
        return modifiedCount > 0;
    });

/**
 * Admin-assisted 2FA recovery: unconditionally strips EVERY second factor, no code required.
 * The door that stays shut everywhere else — self-service disable and the login challenge both
 * demand a code — because a mailbox-based reset would make 2FA only as strong as the inbox it
 * exists to defend against. This is the one deliberate exception, and it is audited.
 *
 * `findByIdWithCredentials`, not `findById`: the 2FA fields are `select: false`, and unsetting a
 * path Mongoose never loaded registers as no change at all — `save()` would silently do nothing.
 *
 * @param id - the user whose second factor is being removed
 * @param context - the admin's caller context, for the audit record
 */
export const adminDisableTwoFactor = (
    id: string,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    const outcome = userRepository
        .findByIdWithCredentials(id)
        .then<ResponseSuccess<UserDocument> | ResponseReject>((user) => {
            if (!user) return generateReject(404, [t('users.not-found')]);

            user.twoFactorMethods = [];
            user.twoFactorEnabledAt = undefined;
            user.twoFactorBackupCodes = [];
            // Emptying an array Mongoose loaded is a change it sees; the field-level unsets the
            // 2FA services have to mark by hand do not apply here.
            return userRepository.save(user).then((saved) => generateSuccess(saved));
        });

    return outcome.then((result) => {
        emitAuditEvent(
            buildAuditEvent(context, {
                action: usersAuditActions.ADMIN_USER_2FA_DISABLED,
                target_type: 'user',
                target_id: id,
                outcome: result.success ? 'success' : 'failure'
            })
        );
        return result;
    });
};

/** Remove a user by ID (soft or hard delete). Fetches the document then delegates to remove(). */
export const removeById = (
    id: string,
    hardDelete = false
): Promise<ResponseSuccess<UserDocument> | ResponseSuccess<undefined> | ResponseReject> =>
    userRepository
        .findById(id)
        .then((user) =>
            user ? remove(user, hardDelete) : generateReject(404, [t('users.not-found')])
        );

/*
 * `account` end of the one shared-kernel relationship in this repo (`docs/theory/strategic-ddd.md`
 * §5): the User document it authenticates, resets, links to OAuth, and 2FA-protects. Read-only
 * lookups below are still thin pass-throughs to `userRepository`, named for the question they
 * answer. WRITES are not: a raw `save`/`build`/`create`/`findOneWithCredentials(where)` published
 * on the barrel is a write (or an arbitrary-filter read) handle any future sibling could import
 * and use for anything, not only `account`. Every write operation below enforces what the
 * document requires by construction instead — it takes only the fields its one caller actually
 * has, and does only the one mutation its name promises.
 */

/** An authenticatable account by id — `active`/soft-delete already excluded by the query. */
const findAuthenticatableById = (id: string) => userRepository.findAuthenticatableById(id);

/** The hydrated document with every `select: false` field loaded (password, tokens, 2FA). */
const findByIdWithCredentials = (id: string) => userRepository.findByIdWithCredentials(id);

/**
 * The credentialed account attempting an email/password login, `select: false` fields (the
 * password hash) included. `active: { $ne: false }` — not `true`, since a pre-migration row has
 * no field at all — blocks a deactivated account at the front door, same clause
 * `findAuthenticatableById` uses.
 */
const findForLogin = (email: string | undefined) =>
    userRepository.findOneWithCredentials({ email, active: { $ne: false }, deletedAt: undefined });

/**
 * The credentialed account already linked to this federated identity, if any — `select: false`
 * fields included because a caller may need to build a 2FA login challenge off
 * `user.twoFactorMethods` right after.
 */
const findByOAuthIdentity = (provider: string, providerId: string) =>
    userRepository.findOneWithCredentials({
        'oauthAccounts.provider': provider,
        'oauthAccounts.providerId': providerId
    });

/** The hydrated document with the pending-email-change field loaded. */
const findByIdWithPendingEmail = (id: string) => userRepository.findByIdWithPendingEmail(id);

/** Whether `email` (or its pending-change counterpart) is already taken by another account. */
const emailOrPendingEmailTaken = (email: string, excludingId: string) =>
    userRepository.emailOrPendingEmailTaken(email, excludingId);

/**
 * The account holding a token of this exact value and type — not filtered by expiry. A caller
 * that needs "live" (exists, right type, not expired) checks `entry.expiration` itself, same as
 * `account/services/tokens.ts`'s `findLiveTokenEntry`.
 */
const findByToken = (token: string, type: Parameters<typeof userRepository.findByToken>[1]) =>
    userRepository.findByToken(token, type);

/** The account currently holding this exact token value, any type. */
const findByTokenValue = (token: string) => userRepository.findByTokenValue(token);

/**
 * Set an account's password — `account/services/profile.ts`'s `passwordChange` is the only
 * caller, itself the funnel both a password reset and an authenticated password change go
 * through. Takes the already-loaded, already-validated account: `passwordChange` refuses a weak
 * or breached password well before this point, so nothing here re-checks either.
 */
const setPassword = (user: UserDocument, password: string): Promise<UserDocument> => {
    user.password = password;
    return userRepository.save(user);
};

/**
 * Append a token (reset, delete-confirmation, or the JWT layer's own refresh rotation) — the
 * named door onto `UserMethods.tokenAdd`, so `account` (the one sibling allowed to hold a
 * hydrated `UserDocument` at all, per the shared-kernel note above) writes through this module
 * instead of calling the document's own instance method directly. `$push`s, never rebuilds the
 * array — see the method's own doc for why that matters under a concurrent request.
 */
const tokenAdd = (
    user: UserDocument,
    type: Token['type'],
    expirationMs: number,
    token: string,
    amr?: string[]
): Promise<string> => user.tokenAdd(type, expirationMs, token, amr);

/** Spend every token of one type at once — "log out everywhere" for that token type. Same reasoning as {@link tokenAdd}. */
const tokenRemoveAll = (user: UserDocument, type: Token['type']): Promise<void> =>
    user.tokenRemoveAll(type);

/**
 * Prove an account's email: stamp `verifiedAt` and save — document-only, per this file's own
 * module docblock. The `unverified` → `customer` promotion that follows a self-service
 * verification is `account`'s own flow's job (`completeEmailVerification`), not this operation's;
 * see `markVerified` in `account/services/verification.ts` for the same split on the
 * password-reset path. Takes the already-loaded holder of the spent token, not an id:
 * `completeEmailVerification`'s caller already found and spent it (see that file's own docblock
 * on why finding and spending are two calls), and a second fetch here would just be a redundant
 * round trip.
 */
const markEmailVerified = (user: UserDocument): Promise<UserDocument> => {
    user.verifiedAt = new Date();
    return userRepository.save(user);
};

/**
 * Swap a proven `pendingEmail` into `email`, and mark the account verified — the new address just
 * proved itself. Document-only, same split as {@link markEmailVerified}: the caller promotes a
 * still-`unverified` role, since an email change can be the first proof an `unverified` signup
 * ever completes. Revoking the account's refresh tokens afterward is also the caller's job, not
 * this operation's — `save` here answers with the document a token-revoke call needs, nothing more.
 */
const applyEmailChange = (user: UserDocument, newEmail: string): Promise<UserDocument> => {
    user.email = newEmail;
    user.pendingEmail = undefined;
    user.verifiedAt = new Date();
    return userRepository.save(user);
};

/**
 * Stamp that an inactive account has been warned, so the reaper (`ops/reap-inactive-accounts.ts`)
 * does not warn it twice. The one field this operation may touch.
 */
const markInactivityWarned = (user: UserDocument): Promise<UserDocument> => {
    user.inactivityWarnedAt = new Date();
    return userRepository.save(user);
};

/**
 * Persist a 2FA method array mutated in place — `account/services/two-factor.ts`'s own
 * `saveMethods` calls this as its last step, for every enrollment, confirmation, removal, disable
 * and backup-code action. `markModified` is not belt-and-braces: several of those paths UNSET a
 * field on a subdocument (a spent code, a replaced secret), and Mongoose does not always see a
 * delete inside an array element as a change on its own — the write would silently do nothing.
 * The mutation itself stays `account`'s: this operation only knows "persist whatever changed",
 * the same way a `save` on any other ORM does once a caller already holds a loaded, owned document.
 */
const persistTwoFactorMethods = (user: UserDocument): Promise<UserDocument> => {
    user.markModified('twoFactorMethods');
    return userRepository.save(user);
};

/** The fields signup's anti-automation decoy path may set — never `verifiedAt`, which is never persisted anyway. */
type SignupDecoyFields = Pick<
    UserDocument,
    'email' | 'username' | 'imageUrl' | 'thumbnailUrl' | 'analyticsConsent' | 'termsAccepted'
>;

/**
 * Construct a document WITHOUT persisting it — signup's anti-automation deception path answers
 * with a document that looks real and was never written, so a policy-refused attempt gets nothing
 * to distinguish it from a genuine one.
 */
const buildSignupDecoy = (data: SignupDecoyFields) => userRepository.build(data);

/**
 * The fields a self-service signup may set — deliberately excludes `verifiedAt`/`active`/
 * `oauthAccounts`, which {@link registerFromOAuth} alone may set: passing any of them here would
 * let a self-service signup skip email verification the same way a provider-vouched one does.
 */
type SelfServiceSignupFields = Pick<
    UserDocument,
    | 'username'
    | 'email'
    | 'imageUrl'
    | 'thumbnailUrl'
    | 'pendingImageKey'
    | 'password'
    | 'analyticsConsent'
    | 'termsAccepted'
    | 'locale'
>;

/**
 * A self-service signup, from the request's own fields — `account`'s OWN orchestration
 * (anti-automation checks, the duplicate-email pre-check, the verification email) runs around
 * this, never `create()`'s admin-panel one (role assignment, admin audit/analytics). Writes no
 * role of its own: the document holds none, and the caller grants `unverified` separately through
 * `assignDefaultRole` — never this function, which never sees a role name to misuse.
 */
const registerSelfService = (data: SelfServiceSignupFields) => userRepository.create(data);

/** The fields an OAuth-vouched signup may set — see {@link registerFromOAuth}. */
type OAuthSignupFields = Pick<
    UserDocument,
    'email' | 'username' | 'imageUrl' | 'verifiedAt' | 'active' | 'locale' | 'oauthAccounts'
>;

/**
 * An account minted from a federated identity — the provider vouches for it, so its caller grants
 * `customer` directly (through `assignRole`, not `assignDefaultRole`) rather than `unverified`,
 * the same way an operator-created account does. Same "writes no role itself" split as
 * {@link registerSelfService} — `verifiedAt` is set at the call site, the membership grant happens
 * there too, never inside this function. Kept as a separate function from
 * {@link registerSelfService} rather than merged despite the identical one-line body: the two
 * field sets below are what actually matters, and a caller passing the wrong one is exactly the
 * mistake narrowing each exists to catch at compile time.
 */
const registerFromOAuth = (data: OAuthSignupFields) => userRepository.create(data);

/**
 * Undo a just-created signup row whose starting-role grant then failed — a hard delete, not
 * `remove()`: that emits `USER_DELETED` and revokes a membership through `access`, both wrong for
 * a row that never finished becoming an account. Left behind, it would keep the email permanently
 * unusable for a retry. Not `remove()`, so not the barrel: this is a compensating step for
 * `account`'s own signup orchestration, not a general-purpose delete.
 */
const discardFailedSignup = (user: UserDocument): Promise<void> =>
    userRepository.deleteOne(user).then(() => undefined);

/** Whether an account already exists for this email — signup's duplicate-email pre-check. */
const emailTaken = (email: string): Promise<boolean> =>
    userRepository.findOne({ email }).then((user) => user !== null);

/** Revoke one refresh token by its subdocument id — "log out that device", not every device. */
const sessionRemove = (id: string, sessionId: string) =>
    userRepository.sessionRemove(id, sessionId);

/** Spend a refresh token by value alone, no user id in the filter — the single-session logout. */
const tokenRemoveByValue = (token: string) => userRepository.tokenRemoveByValue(token);

/** Sweep every token past its reuse-detection retention window. */
const tokenRemoveExpired = (supersededRetentionMs: number) =>
    userRepository.tokenRemoveExpired(supersededRetentionMs);

/** Mark a refresh token superseded — the one-time-use half of rotation. */
const tokenSupersede = (token: string) => userRepository.tokenSupersede(token);

/** Bump a refresh token's last-used stamp, without touching anything else on the document. */
const tokenTouch = (token: string) => userRepository.tokenTouch(token);

/** Attach a federated identity to an existing account. */
const linkOAuthAccount = (
    userId: string,
    account: Parameters<typeof userRepository.linkOAuthAccount>[1]
) => userRepository.linkOAuthAccount(userId, account);

/**
 * Every account inactive past the warning threshold, never yet warned —
 * `ops/reap-inactive-accounts.ts`'s first stage.
 */
const findInactiveUnwarned = (cutoff: Date) => userRepository.findInactiveUnwarned(cutoff);

/**
 * Every account warned, and still inactive past the grace window — the reaper's soft-delete
 * stage.
 */
const findWarnedStillInactive = (cutoff: Date) => userRepository.findWarnedStillInactive(cutoff);

/** Every account soft-deleted by the reaper past ITS OWN grace window — the hard-delete stage. */
const findReaperSoftDeletedPastGrace = (cutoff: Date) =>
    userRepository.findReaperSoftDeletedPastGrace(cutoff);

/** The module's barrel export — the controllers call through this, never the bare functions. */
export const userService = {
    validateData,
    search,
    getById,
    create,
    registerSelfService,
    registerFromOAuth,
    buildSignupDecoy,
    discardFailedSignup,
    update,
    updateById,
    remove,
    removeById,
    adminDisableTwoFactor,
    findByEmail,
    emailTaken,
    findAuthenticatableById,
    findByIdWithCredentials,
    findForLogin,
    findByOAuthIdentity,
    findByIdWithPendingEmail,
    emailOrPendingEmailTaken,
    findByToken,
    findByTokenValue,
    setPassword,
    markEmailVerified,
    applyEmailChange,
    markInactivityWarned,
    persistTwoFactorMethods,
    tokenAdd,
    tokenRemoveAll,
    sessionRemove,
    tokenRemoveByValue,
    tokenRemoveExpired,
    tokenSupersede,
    tokenTouch,
    linkOAuthAccount,
    findInactiveUnwarned,
    findWarnedStillInactive,
    findReaperSoftDeletedPastGrace,
    consumeToken,
    enqueueIfPending,
    // A controller may not reach `./model` directly (the persistence wall), so the shaping
    // helper it needs to build a response rides through the service instead.
    toUser,
    toUserContract
};
