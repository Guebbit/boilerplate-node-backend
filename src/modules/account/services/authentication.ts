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
import { parseFormBoolean, type CallerContext } from '@infrastructure/http/request';
import { analyticsConsentSchema } from '@infrastructure/http/schemas';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { accountAnalyticsEvents } from '../analytics';
import { accountAuditActions } from '../audit';
import { rotateRefreshToken, TokenReuseError } from '../session/jwt';

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
        // High priority: a token-bearing link the user is actively waiting on, not a notification.
        void enqueueEmail(
            { to: user.email, subject: mail.subject },
            mail.template,
            mail.data,
            'high'
        );
    });

/**
 * A bcrypt hash of no real password, computed once at import time (a one-time boot cost, not a
 * per-request one). `login` compares against this on an unknown email, so "no such account"
 * costs the same as "wrong password" — without it, bcrypt's own cost is exactly what makes the
 * fast path a timing oracle for enumerating registered addresses.
 */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(randomBytes(32).toString('hex'), 12);

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
                // High priority: a token-bearing link the user is actively waiting on, not a notification.
                void enqueueEmail(
                    { to: user.email, subject: mail.subject },
                    mail.template,
                    mail.data,
                    'high'
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
        // High priority: a token-bearing link the user is actively waiting on, not a notification.
        void enqueueEmail(
            { to: user.email, subject: mail.subject },
            mail.template,
            mail.data,
            'high'
        );
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
 * Exchange a refresh token for a fresh access token, ROTATING the refresh token in the same
 * breath, and recording the attempt either way. Takes the cookie as
 * found, absence included, so all three ordinary outcomes — missing, invalid, valid — are decided
 * and recorded here; a fourth, reuse of an already-rotated token, gets its own audit action and
 * `metadata.reason` rather than being folded into `invalid_token`, since it is a materially
 * different fact for whoever reads the trail: not a caller with a stale cookie, but a token value
 * that outlived the session it belonged to.
 * @returns the new access/refresh tokens and the refresh cookie's new `maxAge`, for the
 *   controller to set alongside the response
 */
export const refreshAccessToken = (
    refreshToken: string | undefined,
    context: CallerContext
): Promise<{ accessToken: string; refreshToken: string; refreshMaxAgeMs: number }> =>
    (refreshToken
        ? rotateRefreshToken(refreshToken)
        : Promise.reject(new MissingRefreshTokenError())
    )
        .then((result) => {
            emitAuditEvent(
                buildAuditEvent(context, {
                    action: accountAuditActions.AUTH_TOKEN_REFRESHED,
                    outcome: 'success'
                })
            );
            return result;
        })
        .catch((error: unknown) => {
            const reuseDetected = error instanceof TokenReuseError;

            emitAuditEvent(
                buildAuditEvent(context, {
                    action: reuseDetected
                        ? accountAuditActions.AUTH_REFRESH_TOKEN_REUSE_DETECTED
                        : accountAuditActions.AUTH_TOKEN_REFRESHED,
                    // The reuse case DOES know whose account this was — carry the id, unlike the
                    // ordinary failures below, which never got far enough to find out. `actor_role`
                    // is left to its default (`anonymous`): this request never carried a verified
                    // access token, so admin status isn't cheaply known, and getting it wrong would
                    // misreport a fact the id alone already establishes precisely.
                    actor_user_id: reuseDetected ? error.userId : 'anonymous',
                    outcome: 'failure',
                    ...(reuseDetected
                        ? {}
                        : {
                              metadata: {
                                  reason:
                                      error instanceof MissingRefreshTokenError
                                          ? 'missing_token'
                                          : 'invalid_token'
                              }
                          })
                })
            );
            throw error;
        });

/**
 * Everything `POST /account/signup` collects: the submitted fields, plus the image paths
 * `readUploadedImage` derived from the multipart body. One object rather than a positional list
 * because half of these are optional and two are booleans — an argument order nothing but a
 * comment would keep honest.
 */
export interface SignupInput {
    /** The submitted address; `zodUserSchema` owns its shape. */
    email: string;

    /** The submitted display name. */
    username: string;

    /** The submitted password, in the clear; hashed on the way to the document. */
    password: string;

    /** The repeat, compared against `password` and never stored. */
    passwordConfirm: string;

    /**
     * Optional like `UpdateAccountRequest`'s, but with no "leave it alone" reading — there is no
     * prior value at signup, so absent and `false` mean the same thing here.
     */
    analyticsConsent: boolean | undefined;

    /**
     * Not a stored default: the contract requires it, and `signup`'s schema rejects anything but
     * `true`. Validated there rather than on `userSchema` so OAuth linking and the admin `/users`
     * route — neither of which shows this checkbox — aren't forced to restate it.
     */
    termsAccepted: boolean;

    /**
     * Not `| null`: the contract declares `imageUrl` a string, so a null reaches zod as
     * "expected string, received null" and is rejected before `signup`'s `?? ''` could see it.
     * The caller coalesces a body-supplied null away, so `undefined` is the only absence here.
     */
    imageUrl: string | undefined;

    /**
     * Set together with `imageUrl` by `readUploadedImage` — never independently, and never part
     * of the validated schema: both are server-derived, not client input.
     */
    thumbnailUrl: string | undefined;

    /** The staged upload's storage key, handed to the image worker once the account exists. */
    pendingImageKey: string | undefined;
}

/**
 * Register new user.
 *
 * @param input - the submitted fields and the server-derived image paths
 * @param callerContext - the request's context, for the audit and analytics records
 */
export const signup = (
    input: SignupInput,
    callerContext: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    const {
        email,
        username,
        password,
        passwordConfirm,
        analyticsConsent,
        termsAccepted,
        imageUrl,
        thumbnailUrl,
        pendingImageKey
    } = input;

    const parseResult = zodUserSchema
        .extend({
            passwordConfirm: z.string(),
            // Shared with `PUT /account`'s: both decode the same multipart-string trap
            // (`analyticsConsentSchema`'s own doc covers it), signup just narrows it to
            // non-optional-by-intent (absent lands as `undefined`, stored as `false`).
            analyticsConsent: analyticsConsentSchema,
            // Not `analyticsConsentSchema`'s shape: signup needs the multipart decode
            // (`parseFormBoolean`) but a literal-true requirement, not an optional one.
            termsAccepted: z.preprocess(
                parseFormBoolean,
                z.literal(true, { error: () => t('account.signup.terms-not-accepted') })
            )
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
            passwordConfirm,
            analyticsConsent,
            termsAccepted
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
                          analyticsConsent,
                          termsAccepted,
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
            // `password` is select:false — this is one of the few flows that legitimately needs it.
            // `active: { $ne: false }` — not `true`, since a pre-migration row has no field at all —
            // blocks a deactivated account at the front door, same clause `findAuthenticatableById` uses.
            .findOneWithCredentials({ email, active: { $ne: false }, deletedAt: undefined })
            .then((user) => {
                // Compare against DUMMY_PASSWORD_HASH on a miss, so an
                // unknown email costs the same as a wrong password — an unconditional `return`
                // here would answer 401 before bcrypt's own cost, the timing gap that lets an
                // attacker tell "no such account" from "wrong password" by response time alone.
                return bcrypt
                    .compare(password ?? '', user?.password ?? DUMMY_PASSWORD_HASH)
                    .then((doMatch) => {
                        if (!user || !doMatch)
                            return generateReject(401, [t('account.login.wrong-data')]);
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
                // Gone-but-verified is 401 here too — `openapi.yaml` declares no 404 for
                // `logoutAll`, and the caller's session is exactly what no longer exists.
                if (!user) return generateReject(401, []);
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

/**
 * Re-authenticate an already-signed-in caller by password — the verification half of
 * `POST /account/reauth`. Re-minting the session (a fresh `auth_time`) is
 * the CONTROLLER's job via `issueSession`, mirroring how `passwordChange` itself stays separate
 * from `postPasswordChange`'s re-mint — this function only proves the password and audits the
 * attempt.
 *
 * Proves identity the way `passwordChangeWithCurrent` does — bcrypt against the caller's own
 * stored hash, 422 on a mismatch rather than 401. NOT `login`'s path, deliberately: `login`'s 401
 * and its 3.3b dummy-compare exist to stop an ANONYMOUS caller from telling "no such account"
 * apart from "wrong password" by timing, and there is no such caller here — the access token
 * already names exactly who is asking, so there is nothing left to protect by hiding the failure
 * behind the same status code login uses. A 401 here would actively hurt: it reads as "session
 * expired" to a client interceptor and would log out a session that is, in fact, still perfectly
 * valid — the opposite of what a re-authentication endpoint exists to do. The active/deletedAt
 * gate `isAuth` already ran for this very request is not re-checked either, for the same reason
 * `passwordChangeWithCurrent` and `updateProfile` don't re-check it.
 *
 * @param userId - the caller's own id, from their already-verified access token
 * @param password - the password to confirm against the stored hash
 * @param context - for the audit record
 */
export const reauth = (
    userId: string,
    password: string,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    const outcome: Promise<ResponseSuccess<UserDocument> | ResponseReject> = userRepository
        // `password` is select:false — proving identity is this flow's whole point.
        .findByIdWithCredentials(userId)
        .then<ResponseSuccess<UserDocument> | ResponseReject>((user) => {
            // Gone-but-verified is 401 — same rule `updateProfile`/`passwordChangeWithCurrent`
            // follow, and `openapi.yaml` declares no 404 here either.
            if (!user) return generateReject(401, []);

            // An OAuth-only account (`account/oauth/link.ts`) holds no password to compare
            // against — same 422 as a wrong one, since there is equally nothing this step can do.
            if (!user.password) return generateReject(422, [t('account.reauth.wrong-password')]);

            return bcrypt.compare(password, user.password).then((doMatch) => {
                if (!doMatch) return generateReject(422, [t('account.reauth.wrong-password')]);
                return generateSuccess<UserDocument>(user);
            });
        })
        .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error));

    return outcome.then((result) => {
        emitAuditEvent(
            buildAuditEvent(context, {
                action: accountAuditActions.AUTH_REAUTHENTICATED,
                outcome: result.success ? 'success' : 'failure'
            })
        );
        return result;
    });
};
