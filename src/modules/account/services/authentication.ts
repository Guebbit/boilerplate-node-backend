/**
 * @module
 * Authentication — proving who is asking, and the tokens that keep proving it. Signup and login
 * establish an identity; `tokenAdd` and `tokenRemoveAll` are the two writes every flow that
 * issues or revokes a token goes through. Deliberately NOT here: the credential's VALUE — hashing
 * lives on the model's pre-save hook, signing in `../session/jwt`, password changes in
 * `./profile`. See `./index` for why this module's service is a folder.
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
    // Delegates to the document method the JWT layer already uses, rather than duplicating
    // "append a token" here. Both issue a `$push` — the array must be APPENDED TO, never rebuilt.
    // Rebuilding it (`user.tokens = [...]`) writes the whole array back, erasing anything added
    // by a concurrent request in between; `tokens` is exactly the field where two sessions and a
    // reset link routinely collide like that.
    return user.tokenAdd(type, expirationTime ?? 0, token);
};

/**
 * Issue a delete-confirmation token, deliver it, and record the request. Wraps `tokenAdd`
 * rather than emitting inside it, since `tokenAdd`'s other caller (`sendVerificationEmail`)
 * must stay silent. The token value never leaves this file — returning it would hand a live
 * delete credential to a layer that has no business holding one.
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
 * The `tokens.type` a password-reset link carries.
 *
 * Named here rather than spelled at each call site because it is policy, not detail: it used to
 * live as a bare string in a controller where nothing connected it to the TTL it belonged to.
 * `./verification` states its own pair the same way.
 */
export const PASSWORD_RESET_TOKEN_TYPE = 'password';

/** How long a reset link works: an hour, in milliseconds — how long a stolen mailbox stays useful. */
export const PASSWORD_RESET_TOKEN_TTL_MS = 3_600_000;

/**
 * Issue a password-reset token and deliver it — or silently do nothing for an unregistered
 * address. The silence is the feature: `POST /account/reset-request` always answers 200, so the
 * response can't be used to enumerate registered addresses. The boolean return is for the
 * caller's metric only, never a client-visible refusal — the caller audits unconditionally.
 * Like {@link requestAccountDeletion}, the token value never leaves this file.
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
 * Issue a password-set token for an admin-created user with no password, and deliver it. Only
 * caller: `users`' `USER_SETUP_REQUESTED` event — no `CallerContext`, so nothing to audit here
 * (already recorded as `ADMIN_USER_CREATED` in `users/service.ts`). Reuses the reset token
 * type/TTL; only the mail copy differs, see {@link setupRequestEmail}.
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
 * A missing cookie isn't a failure — `postLogout` answers 200 for it either way — so the audit
 * event still fires; there's simply nothing to revoke.
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
            /*
             * This route authenticates by cookie alone, so there is no bearer to resolve and
             * `distinctId` falls back to 'anonymous'. Under Umami the visitor is still separated
             * by the IP + user-agent hash; under PostHog these rows do not attribute to a person.
             */
            emitAnalyticsEvent({
                ...buildAnalyticsBase(context),
                event: accountAnalyticsEvents.USER_LOGGED_OUT,
                properties: { scope: 'session' }
            });
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
 * Takes the cookie as found, absence included, so all three outcomes — missing, invalid, valid —
 * are decided and recorded here. The two failures stay apart in `metadata.reason`: same 401 to
 * the caller, different facts in the audit trail.
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
 * Remove all tokens of a given type for the user (logout-everywhere).
 * The audit emit fires unconditionally: the caller's next step is "clear cookies, answer
 * success" either way, so it was never actually gated on `result.success` — this preserves
 * that rather than introducing a new condition.
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
                // `$pull` rather than filter-and-save: `user.tokens = user.tokens.filter(...)`
                // rebuilds the array, writing it back whole and erasing anything added between
                // this function's read and write. That race window is hard to assert in a test —
                // `$pull` describes a change instead, closing it in the implementation.
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
            // Same name as the single-session logout, told apart by `scope`: one funnel counts
            // logouts, and splitting it across two names would make every rate built on it wrong.
            emitAnalyticsEvent({
                ...buildAnalyticsBase(context),
                event: accountAnalyticsEvents.USER_LOGGED_OUT,
                properties: { scope: 'everywhere' }
            });
            return result;
        });
