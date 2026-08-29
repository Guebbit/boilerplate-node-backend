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
import { zodUserSchema } from './model';
import type { UserDocument } from './model';
import type { CreateUserRequest, SearchUsersRequest, UpdateUserByIdRequest } from '@types';
import { userRepository } from './repository';
import { emitDomainEvent } from '@kernel/events';
import type { CallerContext } from '@infrastructure/http/request';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { usersAnalyticsEvents } from './analytics';
import { usersAuditActions } from './audit';
import { USER_DELETED, USER_SETUP_REQUESTED } from './events';
import type { PaginatedMeta } from '@infrastructure/persistence/search';

/**
 * User Admin Service
 * Single responsibility: admin-facing user CRUD and search.
 * For auth — signup, login, password reset, tokens — see the `account` module.
 */

/**
 * Validate user data for admin create/edit forms.
 * Returns an array of UI-friendly error messages (empty array means valid).
 *
 * Validates the WHOLE schema, not a `.pick()` of email/username/password: a pick would leave
 * `admin`, `active` and `imageUrl` unchecked, so a wrong-typed value reaches Mongoose untouched
 * and `POST /users` with `admin: 'not-a-boolean'` answers 500 (a CastError on save) instead of
 * the 422 the contract promises. The schema is not strict, so unrelated body keys (`id` on a PUT)
 * are still ignored.
 *
 * Takes `unknown` on purpose: this is the boundary that ESTABLISHES the type, so a narrower
 * parameter would only force its callers — all holding raw request bodies — to cast on the way in.
 */
export const validateData = (userData: unknown, requirePassword = true): ResponseErrorItem[] => {
    const schema = requirePassword ? zodUserSchema : zodUserSchema.partial({ password: true });

    const parseResult = schema.safeParse(userData);
    if (!parseResult.success) return validationErrors(parseResult.error);
    return [];
};

/**
 * Search users (DTO-friendly) — admin panel.
 * Uses shared search-helpers for pagination (OCP).
 *
 * No scope argument: `active` is an ordinary searchable column, handled by the repository's
 * `searchable.booleans` like any other filter, and independent of `deletedAt`.
 */
export const search = (
    filters: SearchUsersRequest = {}
): Promise<{
    items: UserDocument[];
    meta: PaginatedMeta;
}> => userRepository.search(filters);

/**
 * Get a single user by ID.
 * Returns undefined when no id provided; result union otherwise (LSP).
 */
export const getById = (id?: string) => {
    if (!id) return Promise.resolve();
    return userRepository.findById(id).then((user) => user ?? undefined);
};

/**
 * Create a new user document, with no email confirmation step.
 *
 * The self-service path is `accountService.signup`, which sends a verification email and leaves
 * `verified` at the schema's `false`. This one exists for the admin write endpoints, where an
 * operator vouches for the address — which is why `verified` is hardcoded `true` here rather than
 * accepted from the caller: it is not a field `CreateUserRequest` exposes, and no caller in this
 * codebase has ever needed to override it.
 *
 * `password` is optional on this contract: an admin may set it directly, exactly as if the user had
 * registered it themselves, or leave it out. When it is left out, Mongoose still needs *something*
 * in the field (`required: true`, `select: false` — see `./model`), so a random value nobody is ever
 * told fills it in; the account is unusable until `sendSetupEmail` (or a later `PUT` with a real
 * password) gives it one. `sendSetupEmail: true` queues the same mail `account`'s "forgot your
 * password" flow sends, worded for "you have none yet" — see `USER_SETUP_REQUESTED` and
 * `account/module.ts`'s subscriber, which is where the token is actually issued.
 *
 * Typed off `CreateUserRequest` — the contract's own generated shape — rather than a hand-picked
 * `Pick<UserRecord, ...>`. `products/service.ts`'s `update`/`updateById` do the same off `Product`;
 * a hand-copied field list is what silently dropped `active` from this module's `update()` below.
 */
export const create = (data: CreateUserRequest, context: CallerContext): Promise<UserDocument> => {
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

        if (passwordProvided || !data.sendSetupEmail) return user;

        return emitDomainEvent(USER_SETUP_REQUESTED, { userId: String(user._id) }).then(() => user);
    });
};

/**
 * Update an existing user document.
 * Returns a result envelope instead of throwing (LSP) — the protocol every service here follows.
 *
 * Typed off `UpdateUserByIdRequest` — the generated contract shape, shared with `updateById()`
 * below — rather than a hand-picked `Pick<UserRecord, ...>`. That hand-picked list was missing
 * `active`, so a `PUT /users/:id` with `active: false` fired `USER_DEACTIVATED` (see
 * `updateById()`) while never actually writing the field: the document stayed active. Typing this
 * off the contract's own shape means a field the contract declares cannot go unhandled here again.
 */
export const update = (
    user: UserDocument,
    data: UpdateUserByIdRequest
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    if (data.email !== undefined) user.email = data.email;
    if (data.username !== undefined) user.username = data.username;
    if (data.admin !== undefined) user.admin = data.admin;
    if (data.active !== undefined) user.active = data.active;
    if (data.imageUrl !== undefined) user.imageUrl = data.imageUrl;
    // The preference that outlives the request — see the `locale` field on the user schema.
    if (data.locale !== undefined) user.locale = data.locale;
    if (data.phone !== undefined) user.phone = data.phone;
    if (data.website !== undefined) user.website = data.website;
    if (data.password && data.password.trim().length > 0) user.password = data.password;

    return userRepository.save(user).then((savedUser) => generateSuccess(savedUser));
};

/**
 * Update an existing user by ID.
 * Fetches the document then delegates to update().
 */
export const updateById = (
    id: string,
    data: UpdateUserByIdRequest,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    // Credentials included: `data.password`, when present, is assigned onto this document.
    userRepository.findByIdWithCredentials(id).then((user) => {
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
 * Remove a user document (soft or hard delete).
 * Soft delete toggles `deletedAt` (acts as a restore if already soft-deleted).
 *
 * A hard delete takes the cart with it. The cart is its own document keyed by `userId`, reachable
 * only through the account, so leaving it behind would strand a row nothing can ever read or
 * clean up. A soft delete keeps it, the same way it keeps everything else about the account.
 *
 * The cleanup arrives as `user.deleted`, emitted and awaited before the write: this module does not
 * know the cart exists, which is what keeps the dependency arrow pointing cart → users rather than
 * both ways. Only the hard path emits, because a soft delete is a restore waiting to happen.
 */
export const remove = (
    user: UserDocument,
    hardDelete = false
): Promise<ResponseSuccess<UserDocument> | ResponseSuccess<undefined> | ResponseReject> => {
    if (hardDelete)
        return emitDomainEvent(USER_DELETED, { userId: user.id })
            .then(() => userRepository.deleteOne(user))
            .then(() => generateSuccess(undefined, 200, t('users.hard-deleted')));

    // The toggle — see `hardDeleteSchema` in `@infrastructure/http/schemas` for what it means.
    user.deletedAt = user.deletedAt ? undefined : new Date();

    return userRepository
        .save(user)
        .then((savedUser) => generateSuccess(savedUser, 200, t('users.soft-deleted')));
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
 * Remove the given token from the user document and persist it.
 * Used to consume a one-time password-reset token after the reset completes.
 *
 * An atomic `$pull`, not a read-modify-write, for the same reason as `tokenAdd`/`tokenRemoveAll`
 * in `./model` — and here the read-modify-write was not merely lossy, it was a 500.
 *
 * `POST /account/reset-confirm` loads the user, changes the password (one `save()`), then calls
 * this (a second `save()` of the same loaded document). Two simultaneous confirms of one token
 * therefore both loaded the document at version V, and the second `save()` to arrive found the
 * version had moved: Mongoose raised a `VersionError`, the controller's blanket `.catch()` turned
 * it into a 500, and a user who clicked a reset link twice saw a server error on a request that
 * had, in fact, already worked.
 *
 * `$pull` is evaluated by mongod against the document as it exists at write time, so a second
 * consume of an already-spent token is a no-op rather than a conflict — which is what "one-time"
 * should mean at the storage layer, rather than being enforced only by whoever read first.
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

/**
 * Remove a user by ID (soft or hard delete).
 * Fetches the document then delegates to remove().
 */
export const removeById = (
    id: string,
    hardDelete = false
): Promise<ResponseSuccess<UserDocument> | ResponseSuccess<undefined> | ResponseReject> =>
    userRepository.findById(id).then((user) => {
        if (!user) return generateReject(404, [t('users.not-found')]);
        return remove(user, hardDelete);
    });

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
    consumeToken
};
