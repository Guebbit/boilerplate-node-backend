/**
 * Authentication — proving who is asking, and the tokens that keep proving it.
 *
 * Signup and login establish an identity; `tokenAdd` and `tokenRemoveAll` are the two writes
 * every flow that issues or revokes one goes through. What is deliberately NOT here is anything
 * about the credential's VALUE — hashing lives on the model's pre-save hook, signing lives in
 * `../session/jwt`, and changing a password is `./profile`'s.
 *
 * See `./index` for why this module's service is a folder.
 */

import { z } from 'zod';
import { getCurrentLocale, getDefaultLocale, t } from '@infrastructure/i18n';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { deleteRequestEmail, resetRequestEmail, setupRequestEmail } from '../emails';
import type { CastError } from 'mongoose';
import { LoginBody } from '@api/schemas.zod';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject,
    validationErrors
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import {
    zodUserSchema,
    userRepository,
    userService,
    type TokenType,
    type UserDocument
} from '@modules/users';
import type { CallerContext } from '@infrastructure/http/request';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { accountAnalyticsEvents } from '../analytics';
import { accountAuditActions } from '../audit';
import { createAccessToken, recordRefreshTokenUse } from '../session/jwt';

/**
 * Add a token to the user (e.g. password reset).
 * Tokens are consumed by the appropriate flow (passwordChange, etc.).
 */
export const tokenAdd = (
    user: UserDocument,
    type: string,
    expirationTime?: number
): Promise<string> => {
    const token = randomBytes(16).toString('hex');
    // Delegates to the document method the JWT layer already uses, rather than keeping a second
    // copy of "append a token" here. Both issue a `$push`, which is the property that matters:
    // the array must be APPENDED TO, never rebuilt. Rebuilding it — `user.tokens = [...]` — makes
    // mongoose write the whole array back, and a request holding a copy loaded moments earlier
    // then erases whatever was added in between. `tokens` is exactly the field where that bites,
    // because two sessions and a reset link are routinely added by different requests at once.
    return user.tokenAdd(type, expirationTime ?? 0, token);
};

/**
 * Issue a delete-confirmation token, deliver it, and record that the caller asked for one.
 *
 * A wrapper around `tokenAdd(user, 'delete', ...)` rather than an emit inside `tokenAdd` itself:
 * that function's third caller, `sendVerificationEmail`, must stay silent — pushing a
 * verification token is a side effect of signup and profile updates, not a request anyone made.
 * `tokenAdd` cannot tell those apart from its own arguments without a flag, so the callers that
 * DO want an audit record wrap it instead.
 *
 * Issuing and sending are one function, and the return type is why: the token value never leaves
 * this file. It used to be returned so a controller could compose the mail, which put a live
 * credential in a layer that has no reason to hold one — and made "a delete token exists" and "the
 * link reached its owner" two steps a caller could get half-right.
 */
export const requestAccountDeletion = (user: UserDocument, context: CallerContext): Promise<void> =>
    tokenAdd(user, 'delete', 3_600_000).then((token) => {
        emitAuditEvent(
            buildAuditEvent(context, {
                action: accountAuditActions.AUTH_ACCOUNT_DELETE_REQUESTED,
                actor_user_id: user.id,
                outcome: 'success'
            })
        );

        /*
         * The recipient's OWN language, the request's only as fallback. What reaches the queue is
         * finished text, so the worker that sends it has no locale to work from and needs none.
         */
        const mail = deleteRequestEmail(
            user.locale ?? context.locale ?? getDefaultLocale(),
            user.username,
            token
        );
        void enqueueEmail({ to: user.email, subject: mail.subject }, mail.template, mail.data);
    });

/**
 * The `tokens.type` a password-reset link carries, and how long it works.
 *
 * Named here rather than spelled at each call site because they are policy, not detail: "a reset
 * link lasts an hour" is a decision about how long a stolen mailbox stays useful, and it used to
 * live as a bare `3_600_000` in a controller where nothing connected it to the type it belonged
 * to. `./verification` states its own pair the same way.
 */
export const PASSWORD_RESET_TOKEN_TYPE = 'password';
export const PASSWORD_RESET_TOKEN_TTL_MS = 3_600_000;

/**
 * Issue a password-reset token and deliver it — or do nothing, silently, for an address that has
 * no account.
 *
 * The silence is the feature. `POST /account/reset-request` answers 200 either way so that the
 * response cannot be used to find out which addresses are registered, and this function is shaped
 * to make that easy to keep: it reports what happened as a boolean for the caller's METRIC, and
 * never as a refusal that could reach a client. Its caller emits the audit record
 * unconditionally, which is why no emit happens here — see `controllers/post-reset-request.ts`.
 *
 * Like {@link requestAccountDeletion}, the token value never leaves.
 *
 * @returns `true` when a mail was queued, `false` when the address has no account
 */
export const requestPasswordReset = (
    email: string | undefined,
    context: CallerContext
): Promise<boolean> => {
    if (!email) return Promise.resolve(false);

    // Credentials included: issuing the token pushes onto this document's `tokens`.
    return userRepository.findOneWithCredentials({ email }).then((user) => {
        if (!user) return false;

        return tokenAdd(user, PASSWORD_RESET_TOKEN_TYPE, PASSWORD_RESET_TOKEN_TTL_MS).then(
            (token) => {
                /*
                 * The account's own language, so the email matches the rest of what this user
                 * receives from us rather than the browser that happened to submit the form. The
                 * copy is finished before the job is published, so the worker needs no locale.
                 */
                const mail = resetRequestEmail(
                    user.locale ?? context.locale ?? getDefaultLocale(),
                    user.username,
                    token
                );
                void enqueueEmail(
                    { to: user.email, subject: mail.subject },
                    mail.template,
                    mail.data
                );
                return true;
            }
        );
    });
};

/**
 * Issue a password-set token for a user an admin just created with no password, and deliver it.
 *
 * The `users` module's `USER_SETUP_REQUESTED` domain event is the only caller — see
 * `../module.ts`'s subscriber. A domain event carries a `userId`, not a `CallerContext`, so unlike
 * {@link requestAccountDeletion} and {@link requestPasswordReset} there is no request here to audit
 * against; the admin's action is recorded once, at the point it happened, on `usersAuditActions.
 * ADMIN_USER_CREATED` in `users/service.ts`'s `create()`.
 *
 * Reuses the password-reset token type and TTL on purpose: `POST /account/reset-confirm` is exactly
 * the endpoint that should consume this link too, since setting a first password and resetting a
 * forgotten one are the same write to the same field. Only the mail's copy differs — see
 * {@link setupRequestEmail}.
 */
export const requestAccountSetup = (user: UserDocument): Promise<void> =>
    tokenAdd(user, PASSWORD_RESET_TOKEN_TYPE, PASSWORD_RESET_TOKEN_TTL_MS).then((token) => {
        const mail = setupRequestEmail(user.locale ?? getDefaultLocale(), user.username, token);
        void enqueueEmail({ to: user.email, subject: mail.subject }, mail.template, mail.data);
    });

/**
 * Revoke one of the caller's own sessions.
 *
 * `emitAuditEvent` only when a token actually matched — `deleteSession` reports the same 404 as
 * an invented id for someone else's session or a stale one, and an audit row would misrepresent a
 * revoke that never happened.
 */
export const sessionRevoke = (
    userId: string,
    sessionId: string,
    context: CallerContext
): Promise<{ modifiedCount: number }> =>
    userRepository.sessionRemove(userId, sessionId).then((result) => {
        if (result.modifiedCount > 0)
            emitAuditEvent(
                buildAuditEvent(context, {
                    action: accountAuditActions.AUTH_SESSION_REVOKED,
                    outcome: 'success'
                })
            );
        return result;
    });

/**
 * Log out of the current session only: revoke the refresh token the caller's cookie names, if
 * any, and record it either way.
 *
 * A missing cookie is not a failure — `postLogout` answers 200 for it, matching "the caller is
 * not logged in here," which is the state they asked for — so the audit event still fires; there
 * is simply nothing to revoke.
 */
export const logoutCurrentSession = (
    refreshToken: string | undefined,
    context: CallerContext
): Promise<void> =>
    (refreshToken ? userRepository.tokenRemoveByValue(refreshToken) : Promise.resolve()).then(
        () => {
            emitAuditEvent(
                buildAuditEvent(context, {
                    action: accountAuditActions.AUTH_LOGGED_OUT,
                    outcome: 'success'
                })
            );
        }
    );

/**
 * The absence of a refresh cookie, as an error, so that the one `catch` below can tell the two
 * failures apart without the happy path having to branch on the token twice.
 */
class MissingRefreshTokenError extends Error {
    constructor() {
        super('Refresh token missing');
        this.name = 'MissingRefreshTokenError';
    }
}

/**
 * Exchange a refresh token for a fresh access token, recording the attempt either way.
 *
 * Takes the cookie as the caller found it, absence included, so all three outcomes — no token, a
 * token that does not verify, a token that does — are decided and recorded here. The two failures
 * stay apart in `metadata.reason`: "never sent a cookie" and "sent one that no longer works" are
 * the same 401 to the caller and very different facts in a trail.
 */
export const refreshAccessToken = (
    refreshToken: string | undefined,
    context: CallerContext
): Promise<string> =>
    (refreshToken
        ? createAccessToken(refreshToken)
              // This route IS the session making a request, and the only place that is true: login
              // issues a session rather than using one. See `recordRefreshTokenUse`.
              .then((token) => recordRefreshTokenUse(refreshToken).then(() => token))
        : Promise.reject<string>(new MissingRefreshTokenError())
    )
        .then((token) => {
            emitAuditEvent(
                buildAuditEvent(context, {
                    action: accountAuditActions.AUTH_TOKEN_REFRESHED,
                    outcome: 'success'
                })
            );
            return token;
        })
        .catch((error: unknown) => {
            emitAuditEvent(
                buildAuditEvent(context, {
                    action: accountAuditActions.AUTH_TOKEN_REFRESHED,
                    actor_user_id: 'anonymous',
                    actor_role: 'anonymous',
                    outcome: 'failure',
                    metadata: {
                        reason:
                            error instanceof MissingRefreshTokenError
                                ? 'missing_token'
                                : 'invalid_token'
                    }
                })
            );
            throw error;
        });

/**
 * Register new user.
 */
export const signup = (
    email: string,
    username: string,
    password: string,
    passwordConfirm: string,
    // Not `| null`: the contract declares `imageUrl` a string, so a null reaches zod as
    // "expected string, received null" and is rejected before the `?? ''` below could see it.
    // The caller coalesces a body-supplied null away, so `undefined` is the only absence here.
    imageUrl: string | undefined,
    // Set together with `imageUrl` by `readUploadedImage` — never independently, and never part
    // of the validated schema below: both are server-derived, not client input.
    thumbnailUrl: string | undefined,
    pendingImageKey: string | undefined,
    callerContext: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    const parseResult = zodUserSchema
        .extend({
            passwordConfirm: z.string()
        })
        .superRefine(({ passwordConfirm, password }, refinementContext) => {
            if (passwordConfirm !== password)
                refinementContext.addIssue({
                    code: 'custom',
                    message: t('account.signup.password-dont-match')
                });
        })
        .safeParse({
            email,
            username,
            imageUrl,
            password,
            passwordConfirm
        });

    const outcome: Promise<ResponseSuccess<UserDocument> | ResponseReject> = parseResult.success
        ? userRepository
              .findOne({ email })
              .then<ResponseSuccess<UserDocument> | ResponseReject>((user) => {
                  if (user) return generateReject(409, [t('account.signup.email-already-used')]);
                  return userRepository
                      .create({
                          username,
                          email,
                          imageUrl: imageUrl ?? '',
                          thumbnailUrl,
                          pendingImageKey,
                          password,
                          // The language they signed up in, kept for work that happens later
                          // without a request to read `Accept-Language` from — a queued email, a
                          // nightly job. Editable afterwards from the user endpoints.
                          locale: getCurrentLocale()
                      })
                      .then((createdUser) =>
                          generateSuccess<UserDocument>(userService.enqueueIfPending(createdUser))
                      );
              })
              .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error))
        : Promise.resolve(generateReject(422, validationErrors(parseResult.error)));

    return outcome.then((result) => {
        if (!result.success) {
            emitAuditEvent(
                buildAuditEvent(callerContext, {
                    action: accountAuditActions.AUTH_SIGNED_UP,
                    actor_user_id: 'anonymous',
                    actor_role: 'anonymous',
                    outcome: 'failure'
                })
            );
            return result;
        }

        const newUserId = result.data?.id ?? 'unknown';
        emitAuditEvent(
            buildAuditEvent(callerContext, {
                action: accountAuditActions.AUTH_SIGNED_UP,
                actor_user_id: newUserId,
                actor_role: 'user',
                outcome: 'success'
            })
        );
        emitAnalyticsEvent({
            ...buildAnalyticsBase(callerContext),
            distinctId: newUserId,
            event: accountAnalyticsEvents.USER_SIGNED_UP
        });
        return result;
    });
};

/**
 * Login user by email/password.
 */
export const login = (
    email?: string,
    password?: string
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    const parseResult = LoginBody.safeParse({
        email,
        password
    });

    if (!parseResult.success)
        return Promise.resolve(generateReject(422, validationErrors(parseResult.error)));

    return (
        userRepository
            // `password` is select:false — this is one of the few flows that legitimately needs it
            .findOneWithCredentials({ email, deletedAt: undefined })
            .then((user) => {
                if (!user) return generateReject(401, [t('account.login.wrong-data')]);

                return bcrypt.compare(password ?? '', user.password).then((doMatch) => {
                    if (!doMatch) return generateReject(401, [t('account.login.wrong-data')]);
                    return generateSuccess<UserDocument>(user);
                });
            })
            .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error))
    );
};

/**
 * Remove all tokens of a given type for the user identified by userId.
 * Used by logout-everywhere flows.
 *
 * The audit emit fires unconditionally, matching the controller it moved down from: whatever this
 * resolves to, the caller's next step is "destroy the local cookies and answer success" either
 * way, so the emit was never actually gated on `result.success` and this preserves that exactly
 * rather than introducing a new condition on the way down.
 */
export const tokenRemoveAll = (
    userId: string,
    type: TokenType,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    userRepository
        // `tokens` is select:false — needed here to filter and re-save them
        .findByIdWithCredentials(userId)
        .then(
            (
                user
            ):
                | ResponseSuccess<UserDocument>
                | ResponseReject
                | Promise<ResponseSuccess<UserDocument>> => {
                if (!user) return generateReject(404, []);
                // `$pull` rather than filter-and-save, for the reason above read in the other
                // direction: `user.tokens = user.tokens.filter(...)` is a rebuild, so it writes
                // the whole array back and erases anything added between this function's own read
                // and its write. That window is small and cannot be opened deterministically from
                // a test, which is the argument for closing it in the implementation rather than
                // asserting about it — `$pull` describes a change, so there is no window at all.
                return user.tokenRemoveAll(type).then(() => generateSuccess<UserDocument>(user));
            }
        )
        .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error))
        .then((result) => {
            emitAuditEvent(
                buildAuditEvent(context, {
                    action: accountAuditActions.AUTH_LOGGED_OUT_EVERYWHERE,
                    outcome: 'success'
                })
            );
            return result;
        });
