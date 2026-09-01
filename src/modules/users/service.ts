/**
 * @module
 * User Admin Service — single responsibility: admin-facing user CRUD and search.
 * For auth — signup, login, password reset, tokens — see the `account` module.
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
import { zodUserSchema, TokenType } from './model';
import type { UserDocument } from './model';
import type { CreateUserRequest, SearchUsersRequest, UpdateUserByIdRequest } from '@types';
import { userRepository } from './repository';
import { enqueueImageDigest } from '@infrastructure/adapters/image.worker';
import { emitDomainEvent } from '@kernel/events';
import type { CallerContext } from '@infrastructure/http/request';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { usersAnalyticsEvents } from './analytics';
import { usersAuditActions } from './audit';
import { USER_DELETED, USER_SETUP_REQUESTED } from './events';
import type { PaginatedMeta } from '@infrastructure/persistence/search';

/**
 * Validate user data for admin create/edit forms; returns UI-friendly error messages (empty means
 * valid). Validates the WHOLE schema, not a `.pick()`: a pick would leave `admin`/`active`/
 * `imageUrl` unchecked, so a wrong-typed value would reach Mongoose and answer 500 instead of the
 * 422 the contract promises. Takes `unknown` since this is the boundary that establishes the type.
 */
export const validateData = (userData: unknown, requirePassword = true): ResponseErrorItem[] => {
    const schema = requirePassword ? zodUserSchema : zodUserSchema.partial({ password: true });

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
export const getById = (id?: string) => {
    if (!id) return Promise.resolve();
    return userRepository.findById(id).then((user) => user ?? undefined);
};

/**
 * Enqueue the digest job for a just-persisted user, when its write carried a pending upload.
 * Fire-and-forget, like every other post-write dispatch here: a `pendingImageKey` only ever means
 * a broker accepted the upload at request time, so this is a queue publish, not a CPU-bound
 * digest, and the caller must not wait on it.
 */
export const enqueueIfPending = (user: UserDocument): UserDocument => {
    if (user.pendingImageKey)
        void enqueueImageDigest(
            { collection: 'users', documentId: String(user._id), key: user.pendingImageKey },
            userRepository.writebackImage
        );
    return user;
};

/**
 * Create a new user document, with no email confirmation step — the self-service path is
 * `accountService.signup`. `verified` is hardcoded `true` since an operator typing the address is
 * the vouching. `password` is optional: left out, a random value nobody is told fills the
 * `required` field, and `sendSetupEmail: true` queues a setup mail (`USER_SETUP_REQUESTED`) until
 * a real one is set. Typed off `CreateUserRequest` rather than a hand-picked `Pick`, since a
 * hand-copied list is what silently dropped `active` from `update()` below.
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

    return userRepository.create({ verified: true, ...data, password }).then((user) => {
        emitAuditEvent(
            buildAuditEvent(context, {
                action: usersAuditActions.ADMIN_USER_CREATED,
                outcome: 'success',
                target_type: 'user',
                target_id: String(user._id),
                // Recorded here, not by `account`'s domain-event handler: that handler has no
                // request to build a `CallerContext` from, only a `userId`, so the admin's action
                // is the only point in the flow with someone to attribute it to.
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

        enqueueIfPending(user);

        if (passwordProvided || !data.sendSetupEmail) return user;

        return emitDomainEvent(USER_SETUP_REQUESTED, { userId: String(user._id) }).then(() => user);
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
    }
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    if (data.email !== undefined) user.email = data.email;
    if (data.username !== undefined) user.username = data.username;
    if (data.admin !== undefined) user.admin = data.admin;
    if (data.active !== undefined) user.active = data.active;
    // The three travel as one unit, all produced by the same `readUploadedImage` call on the
    // controller — set together whenever a new upload replaces the image.
    if (data.imageUrl !== undefined) {
        user.imageUrl = data.imageUrl;
        user.thumbnailUrl = data.thumbnailUrl;
        user.pendingImageKey = data.pendingImageKey;
    }
    // The preference that outlives the request — see the `locale` field on the user schema.
    if (data.locale !== undefined) user.locale = data.locale;
    if (data.phone !== undefined) user.phone = data.phone;
    if (data.website !== undefined) user.website = data.website;
    if (data.password && data.password.trim().length > 0) user.password = data.password;

    return userRepository.save(user).then((savedUser) => {
        /*
         * Deactivation ends every live session. Defense in depth on top of
         * `findAuthenticatableById` (BETTER_SECURITY.md wave 1.2), which already blocks a
         * deactivated account's next request — this also makes `GET /account/sessions` honest
         * and drops credentials with no live account behind them. Chained after the save, not
         * blocking it: a revoke failure here must not turn a successful deactivation into a
         * reported failure — 1.2 is the backstop either way.
         */
        const revoke =
            data.active === false
                ? savedUser.tokenRemoveAll(TokenType.REFRESH).catch(() => undefined)
                : Promise.resolve();
        return revoke.then(() => generateSuccess(enqueueIfPending(savedUser)));
    });
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

        return update(user, data).then((result) => {
            if (result.success) {
                emitAuditEvent(
                    buildAuditEvent(context, {
                        action: usersAuditActions.ADMIN_USER_UPDATED,
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
 * already soft-deleted). A hard delete emits `user.deleted`, awaited before the write, so cart
 * cleanup happens without this module knowing the cart exists — keeping the dependency arrow
 * pointing cart → users. Only the hard path emits, since a soft delete is a restore waiting to
 * happen.
 */
export const remove = (
    user: UserDocument,
    hardDelete = false
): Promise<ResponseSuccess<UserDocument> | ResponseSuccess<undefined> | ResponseReject> => {
    if (hardDelete)
        return emitDomainEvent(USER_DELETED, { userId: user.id })
            .then(() => userRepository.deleteOne(user))
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
 *
 * @param email
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
        user.tokens = user.tokens.filter((tk) => tk.token !== token);
        // `true` only for the caller whose write actually removed it. Two simultaneous uses of one
        // reset link both pass the earlier "does this token exist" read, so this is the only
        // point at which they can be told apart — see `postResetConfirm`.
        return modifiedCount > 0;
    });

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

/** The module's barrel export — the controllers call through this, never the bare functions. */
export const userService = {
    validateData,
    search,
    getById,
    create,
    update,
    updateById,
    remove,
    removeById,
    findByEmail,
    consumeToken,
    enqueueIfPending
};
