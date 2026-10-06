/**
 * @module
 * The account a person manages about themselves — their profile fields, and their password.
 * Split from `./authentication` along the PROVING-vs-MAINTAINING line: login/signup answer "who
 * is this", everything here answers "change something about the account I'm already
 * authenticated as". The password belongs here since every flow that writes one is a change to
 * an existing account, not a way into it. See `./index` for why this module's service is a folder.
 */

import { z } from 'zod';
import { t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import {
    resetConfirmEmail,
    deleteConfirmEmail,
    emailChangeNoticeEmail,
    greetableName,
    recipientLocale
} from '../emails';
import { sendAccountMail } from './mail';
import { mailRecipientRefusal } from '../mail-budget';
import {
    sendVerificationEmail,
    markVerified,
    resendCooldownRemaining,
    EMAIL_CHANGE_TOKEN_TYPE
} from './verification';
import { resendTooSoon } from '../cooldown';
import { ERROR_CODES } from '@api/error-codes';
import { verifyOwnPassword, PASSWORD_RESET_TOKEN_TYPE } from './authentication';
import { findLiveToken, spendLiveToken } from './tokens';
import { UpdateAccountBody } from '@api/schemas.zod';
import { optionalBooleanSchema } from '@infrastructure/http/schemas';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject,
    type ResponseErrorItem,
    validationErrors
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import { assertPasswordNotBreached } from '@infrastructure/security/breached-passwords';
import {
    zodUserSchema,
    userService,
    TokenType,
    normalizeEmail,
    type UserDocument
} from '@modules/users';
import type { CallerContext } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import { accountAnalyticsEvents } from '../analytics';
import { accountAuditActions } from '../audit';
import { isUnrestrictedCaller } from '../roles';

/**
 * The write a completed reset rides along on: the proven mailbox verifies the address, and the
 * 2FA wrong-code counter and lock clear. Someone who can read the mailbox has the account's own
 * recovery path, so the lock holds nothing back from them.
 */
const markResetCompleted = (user: UserDocument): Promise<void> => {
    user.mfaFailures = 0;
    user.mfaLockedUntil = undefined;
    return markVerified(user);
};

/**
 * Validate a new-password pair without touching the user.
 * Split out of {@link passwordChange} so `reset-confirm` can validate BEFORE spending the
 * one-time token — consuming it is what resolves two simultaneous uses of one reset link, so
 * only a well-formed request should get the chance to spend it.
 * @returns the UI-facing messages, empty when the pair is acceptable
 */
export const validatePasswordChange = (
    password = '',
    passwordConfirm = ''
): ResponseErrorItem[] => {
    const parseResult = zodUserSchema
        .pick({
            password: true
        })
        .extend({
            passwordConfirm: z.string()
        })
        .superRefine(({ passwordConfirm, password }, context) => {
            if (passwordConfirm !== password) {
                context.addIssue({
                    code: 'custom',
                    message: t('account.signup.password-dont-match')
                });
            }
        })
        .safeParse({
            password,
            passwordConfirm
        });

    if (parseResult.success) return [];
    return validationErrors(parseResult.error);
};

/**
 * Change user password with validation, then revoke every refresh token on the account.
 * The funnel both `passwordResetChange` and `passwordChangeWithCurrent` end at, so a future
 * third caller gets the revoke for free. Order
 * matters — save first, revoke second: a revoke landing against a password write that then fails
 * would log everyone out for nothing. The revoke's own failure is swallowed rather than turned
 * into a rejection: the password write already succeeded, and a lost revoke is defense in depth
 * this codebase can afford to lose once, not a reason to tell the caller their change failed.
 * `passwordChangeWithCurrent`'s caller re-mints its own session on top of this — see
 * `postPasswordChange` and `../session/session`'s `issueSession`.
 *
 * @param user - the account, carrying its credential fields
 * @param password - the new password, as typed
 * @param passwordConfirm - the repeat, which must match
 * @param beforeSave - a caller's own mutation to ride along in the same write, run only once
 *   every refusal is behind us. A parameter rather than a mutation the caller makes first: a
 *   refused password must not leave a half-applied change on the document, and the only place
 *   that can be guaranteed is here, next to the `save`. May return a `Promise` — `markVerified`'s
 *   role promotion is a membership write, not a field mutation, so it cannot be purely synchronous.
 */
export const passwordChange = (
    user: UserDocument,
    password = '',
    passwordConfirm = '',
    beforeSave?: (user: UserDocument) => void | Promise<void>
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    const errors = validatePasswordChange(password, passwordConfirm);

    if (errors.length > 0) return Promise.resolve(generateReject(422, errors));

    // One check for both callers: `passwordResetChange` and `passwordChangeWithCurrent` both
    // funnel through this function.
    return assertPasswordNotBreached(password).then((breachErrors) => {
        if (breachErrors.length > 0) return generateReject(422, breachErrors);

        return writePassword(user, password, beforeSave);
    });
};

/**
 * The write half of {@link passwordChange}, for a caller that has already run every check on the
 * password itself — shape, match, breach — and must not run the breach lookup a second time.
 * Saves first and revokes every refresh token second, for the reason {@link passwordChange} gives.
 *
 * @param user - the account, carrying its credential fields
 * @param password - the new password, already accepted
 * @param beforeSave - a caller's own mutation to ride along in the same write
 */
const writePassword = (
    user: UserDocument,
    password: string,
    beforeSave?: (user: UserDocument) => void | Promise<void>
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    Promise.resolve(beforeSave?.(user))
        .then(() => userService.setPassword(user, password))
        .then((savedUser) =>
            userService
                .tokenRemoveAll(savedUser, TokenType.REFRESH)
                .catch(() => undefined)
                .then(() => generateSuccess<UserDocument>(savedUser))
        )
        .catch((error: unknown) => rejectDatabaseEnvelope('auth', error));

/**
 * Read the caller's own profile.
 * `findByIdWithPendingEmail`, not `userService.getById`: that read is shared with the admin's
 * `get-user-item.ts` lookup, which has no business seeing a pending change, and the caller's own
 * client needs it to show "verification pending for …" — `pendingEmail` is otherwise
 * `select: false`. Not a wrapper around an emit inside `getById` either, for a second reason: an
 * unconditional `user_profile_viewed` there would miscount admin lookups as the user's own view.
 */
export const getOwnProfile = (
    userId: string,
    context: CallerContext
): Promise<UserDocument | undefined> => {
    emitAnalyticsEvent({
        ...buildAnalyticsBase(context),
        event: accountAnalyticsEvents.USER_PROFILE_VIEWED
    });
    return userService.findByIdWithPendingEmail(userId).then((user) => user ?? undefined);
};

/**
 * Change the password from a reset link, record it, and notify the account holder.
 * Wraps {@link passwordChange} rather than emitting inside it, since that function is also
 * `passwordChangeWithCurrent`'s last step (which reports its own `AUTH_PASSWORD_CHANGED`).
 * The mail is sent here, not by the controller, since "a password was reset" is a fact about
 * the account — any future caller gets the notification for free.
 *
 * Also marks the address verified. The token just spent was delivered to that mailbox and
 * nowhere else, so it proves possession exactly as strongly as a `verify` token does — and
 * without this, someone whose verification mail never arrived could reset from that same inbox
 * and still be held at `unverified`, with a re-send of the mail that already failed as their only
 * remedy. `passwordChangeWithCurrent` deliberately does NOT get this: an already-signed-in caller
 * typing their current password proves nothing about the mailbox.
 *
 * `markVerified` mutates, and rides in as `passwordChange`'s `beforeSave` so one write persists
 * both facts — and so a refused password (too weak, breached) cannot verify an address on its way
 * out: the hook runs after the last refusal, not before the first.
 */
export const passwordResetChange = (
    user: UserDocument,
    password: string,
    passwordConfirm: string,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    passwordChange(user, password, passwordConfirm, markResetCompleted).then((result) =>
        afterReset(result, user, context)
    );

/**
 * What follows a finished reset: on success, the audit row and the confirmation mail. Shared by
 * {@link passwordResetChange} and {@link completePasswordReset}, which differ only in how the
 * password was checked.
 *
 * @param result - what writing the password answered
 * @param user - the account
 * @param context - the caller, for the audit row and the mail's language fallback
 */
const afterReset = (
    result: ResponseSuccess<UserDocument> | ResponseReject,
    user: UserDocument,
    context: CallerContext
): ResponseSuccess<UserDocument> | ResponseReject => {
    if (result.success) {
        // Read fresh, after `markVerified` may have just promoted it — the document carries
        // no role of its own to read synchronously. Same fire-and-forget shape as the
        // mail below: the password change already succeeded, so a lookup hiccup here must not
        // turn a successful reset into an error — worst case, this one audit row is missing.
        void isUnrestrictedCaller(String(user._id))
            .then((unrestricted) => {
                recordAudit(context, {
                    action: accountAuditActions.AUTH_PASSWORD_RESET_COMPLETED,
                    actor_user_id: String(user._id),
                    actor_role: unrestricted ? 'admin' : 'user',
                    outcome: 'success'
                });
            })
            .catch((error: unknown) => {
                // Still just a missing audit row, not a reset failure — see the comment
                // above — but a swallowed lookup failure had no trail at all before this.
                logger.warn({
                    message: 'Could not audit a completed password reset.',
                    userId: String(user._id),
                    error
                });
            });

        /*
         * The recipient's OWN language first. These links are clicked from an email client,
         * possibly on a shared or borrowed device, so the request's `Accept-Language` says
         * very little about who the message is for — it is the fallback, not the answer. The
         * copy is finished before the job is published, so the worker needs no locale at all.
         *
         * Fire-and-forget: the password has already changed, and a queue that is briefly
         * unavailable must not turn a successful reset into an error.
         */
        const mail = resetConfirmEmail(
            recipientLocale(user.locale, context),
            greetableName(user, user.email)
        );
        // Normal priority: a confirmation, not a link or code anyone is blocked on.
        void sendAccountMail(user.email, mail, 'normal');
    }
    return result;
};

/**
 * `POST /account/reset-confirm` — the whole reset, in the order that never burns a link for a
 * password that was going to be refused: shape and match, then the live token is FOUND, then the
 * breach check, and only then is the token SPENT. The spend is the atomic `$pull` that settles two
 * simultaneous uses of one link, so it stays last; everything before it is a read.
 *
 * The same find/spend split `two-factor.ts` uses for a login challenge.
 *
 * @param token - the token from the mailed link
 * @param password - the new password
 * @param passwordConfirm - the repeat
 * @param context - the caller
 * @returns the account on success; a 422 for a bad password pair, a breached password, or a link
 *   that is unknown, expired or already used — the last three read alike on purpose
 */
export const completePasswordReset = (
    token: string,
    password: string,
    passwordConfirm: string,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    const errors = validatePasswordChange(password, passwordConfirm);
    if (errors.length > 0) return Promise.resolve(generateReject(422, errors));

    const linkRefused = () => generateReject(422, [t('account.reset.token-not-found')]);

    return findLiveToken(PASSWORD_RESET_TOKEN_TYPE, token)
        .then((user) => {
            if (!user) return linkRefused();

            return assertPasswordNotBreached(password).then((breachErrors) => {
                if (breachErrors.length > 0) return generateReject(422, breachErrors);

                return spendLiveToken(user, token).then((spentByThisRequest) =>
                    spentByThisRequest
                        ? writePassword(user, password, markResetCompleted).then((result) =>
                              afterReset(result, user, context)
                          )
                        : linkRefused()
                );
            });
        })
        .catch((error: unknown) => rejectDatabaseEnvelope('auth', error));
};

/**
 * Hard-delete the caller's own account, confirmed by a one-time token.
 * Wraps `userService.remove` rather than emitting inside it: `remove` is also `removeById`'s
 * last step for the admin `DELETE /users/:id`, which already reports its own
 * `ADMIN_USER_ERASED`/`ADMIN_USER_SOFT_DELETED`. Emitting inside `remove` would double up there,
 * and — worse — misattribute
 * it: this event's `actor_user_id`/`actor_role` are the deleted account's own, correct for a
 * self-delete but backwards for an admin's.
 */
export const removeOwnAccount = (
    user: UserDocument,
    context: CallerContext
): ReturnType<typeof userService.remove> => {
    /*
     * Read before the write. This is a hard delete, so after `remove` resolves there is no
     * document left to take an address, a name or a language from — the goodbye mail has to be
     * addressed from a copy taken while the account still existed. The role is read the same way,
     * from the membership store rather than the document, which holds none — `remove`'s own
     * erasure cascade may already have revoked the membership by the time this resolves.
     */
    const { email, locale, _id } = user;
    // The name only if this is the verified address, decided now, while the document exists.
    const goodbyeName = greetableName(user, email);

    return isUnrestrictedCaller(String(_id)).then((unrestricted) =>
        userService.remove(user, true).then((result) => {
            if (result.success) {
                recordAudit(context, {
                    action: accountAuditActions.AUTH_ACCOUNT_DELETE_COMPLETED,
                    actor_user_id: String(_id),
                    actor_role: unrestricted ? 'admin' : 'user',
                    outcome: 'success'
                });
                emitAnalyticsEvent({
                    ...buildAnalyticsBase(context),
                    distinctId: String(_id),
                    event: accountAnalyticsEvents.ACCOUNT_DELETED
                });

                // The recipient's own language first, the request's as fallback — see
                // {@link passwordResetChange} for why the request is only ever the fallback.
                const mail = deleteConfirmEmail(recipientLocale(locale, context), goodbyeName);
                // Normal priority: a goodbye, not a link or code anyone is blocked on.
                void sendAccountMail(email, mail, 'normal');
            }
            return result;
        })
    );
};

/**
 * What `PUT /account` and `PATCH /account` both ultimately write, validated with this codebase's
 * messages. `email`/`username` come from `zodUserSchema` (carries the i18n thunks); `locale`,
 * `imageUrl`, `phone`, `website` come straight from `UpdateAccountBody` — the merge-shaped
 * contract schema, since every field this function sees is already optional by the time it runs: `update-account.ts`'s PUT path already filled an omitted one with `null`
 * before calling here. `.partial()` last: every field is optional, and absence means "leave it
 * alone".
 */
const zodProfileSchema = zodUserSchema
    .pick({ email: true, username: true })
    .extend({
        locale: UpdateAccountBody.shape.locale,
        phone: UpdateAccountBody.shape.phone,
        website: UpdateAccountBody.shape.website,
        // Absence still means "leave it alone", same as every other field here, not "withdraw
        // consent". `optionalBooleanSchema`, not `UpdateAccountBody.shape` directly: a multipart
        // request carries this as a string, and `'false'` is truthy.
        analyticsConsent: optionalBooleanSchema,
        // Not on `UpdateAccountBody` — both are `readOnly`/absent from the contract because the
        // server, not the client, produces them. They ride along here only because the controller
        // passes them from its own `readUploadedImage` call, the same way `imageUrl` does when an
        // upload — rather than a body value — is what set it.
        // The server-decided path (`readUploadedImage`), or `null` to remove — never a client's
        // own string: the wire schema only lets the body carry `null`.
        imageUrl: z.string().min(1).nullable().optional(),
        thumbnailUrl: z.string().optional(),
        pendingImageKey: z.string().optional()
    })
    .partial();

/**
 * Result of evaluating `PUT/PATCH /account`'s `email` field against the pending-change rules — see
 * {@link applyEmailChangeRequest}. `requested` is true only when THIS call is what set
 * `pendingEmail`, which is what gates the old-address notice and the new verification link: a
 * plain cancellation or a profile update that never touched `email` sends neither.
 */
interface EmailChangeOutcome {
    conflict: boolean;
    requested: boolean;
}

/**
 * Applies `PUT/PATCH /account`'s `email` field to `user.pendingEmail` — never straight to
 * `user.email`. The account keeps its current, PROVEN address until the new one is confirmed
 * through `POST /account/email-change-confirm` — docs/modules/account.md#proving-an-address.
 *
 * Outcomes:
 * - Absent field:    leaves everything alone.
 * - CURRENT address: a no-op. A `PUT` (`email` required), or a save that merely didn't change it,
 *                    must not silently cancel a pending change the caller never asked to cancel —
 *                    see {@link cancelPendingEmailChange} for that explicit action.
 * - PENDING address: a no-op too. A retried or double-submitted save would otherwise mail both
 *                    addresses again and replace the link already delivered.
 * - Any OTHER address: checked against every account's `email` AND `pendingEmail` first — the
 *                    REQUEST-TIME half of the collision rule. `users_pending_email` and
 *                    `users_email` (both unique) are the swap-time half, since the two are up to
 *                    24 hours apart and only the indexes are still there for both.
 *
 * Mutates `user` in place; the caller's own `save()` (inside `userService.update`) persists it.
 * @param user - the loaded document; must carry `pendingEmail` (`findByIdWithCredentials`)
 * @param requestedEmail - `parseResult.data.email`, or `undefined` when the field was omitted
 */
const applyEmailChangeRequest = (
    user: UserDocument,
    requestedEmail: string | undefined
): Promise<EmailChangeOutcome> => {
    if (
        requestedEmail === undefined ||
        normalizeEmail(requestedEmail) === normalizeEmail(user.email) ||
        (user.pendingEmail !== undefined &&
            normalizeEmail(requestedEmail) === normalizeEmail(user.pendingEmail))
    )
        return Promise.resolve({ conflict: false, requested: false });

    return userService.emailOrPendingEmailTaken(requestedEmail, user.id).then((taken) => {
        if (taken) return { conflict: true, requested: false };
        user.pendingEmail = requestedEmail;
        return { conflict: false, requested: true };
    });
};

/**
 * `DELETE /account/pending-email` — the explicit cancel. Resending the current address through
 * {@link applyEmailChangeRequest} never performs one as a side effect. A no-op when nothing is
 * pending, so a client can call it without checking `GET /account` first — but when something WAS
 * pending, the live `email-change` link is revoked in the same call, so it cannot still swap in
 * the address this cancel just gave up on.
 */
export const cancelPendingEmailChange = (
    userId: string,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    userService
        .findByIdWithPendingEmail(userId)
        .then<ResponseSuccess<UserDocument> | ResponseReject>((user) => {
            if (!user) return generateReject(401, []);
            const hadPending = Boolean(user.pendingEmail);
            return userService
                .cancelPendingEmail(user)
                .then((saved) => revokeCancelledChange(hadPending, saved, context))
                .then((saved) => generateSuccess(saved, 200, t('account.email-change.cancelled')));
        })
        .catch((error: unknown) => rejectDatabaseEnvelope('auth', error));

/**
 * Revoke the now-pointless `email-change` token and audit the cancel — only when a change was
 * actually pending, so a no-op cancel doesn't claim (or log) one that never happened.
 */
const revokeCancelledChange = (
    hadPending: boolean,
    user: UserDocument,
    context: CallerContext
): Promise<UserDocument> => {
    if (!hadPending) return Promise.resolve(user);
    return userService.tokenRemoveAll(user, EMAIL_CHANGE_TOKEN_TYPE).then(() => {
        recordAudit(context, {
            action: accountAuditActions.AUTH_EMAIL_CHANGE_CANCELLED,
            outcome: 'success'
        });
        return user;
    });
};

/**
 * The two mails a genuine `pendingEmail` request sends: a notice to the OLD address — no token,
 * no link, see {@link emailChangeNoticeEmail} — and the verification link to the new one.
 * AWAITED, unlike most account mail: the verification half pushes a token onto this same
 * document first (`sendVerificationEmail`'s own `tokenAdd`), matching `requestEmailVerificationFor`'s
 * treatment of the identical function — responding before either finishes would race the token
 * with whatever the client does next.
 */
const sendEmailChangeMail = (user: UserDocument, context: CallerContext): Promise<void> => {
    const mail = emailChangeNoticeEmail(
        recipientLocale(user.locale, context),
        greetableName(user, user.email),
        user.pendingEmail ?? ''
    );
    return sendAccountMail(user.email, mail).then(() =>
        sendVerificationEmail(user, context, EMAIL_CHANGE_TOKEN_TYPE)
    );
};

/**
 * The fields `PUT/PATCH /account` accepts, after parsing — the input half of {@link writeProfile}.
 */
type ProfileFields = z.infer<typeof zodProfileSchema>;

/**
 * Sends the two mails a genuine change owes, then records that it was requested. The audit event
 * follows the mail rather than the write: what is worth auditing is that a confirmation is now in
 * someone's inbox, not that a field was set.
 */
const notifyEmailChangeRequested = (user: UserDocument, context: CallerContext): Promise<void> =>
    sendEmailChangeMail(user, context).then(() => {
        recordAudit(context, {
            action: accountAuditActions.AUTH_EMAIL_CHANGE_REQUESTED,
            outcome: 'success'
        });
    });

/**
 * Persists the parsed fields, then sends the change mail when — and only when — this call is what
 * set `pendingEmail`. `email` is never forwarded: {@link applyEmailChangeRequest} has already run
 * and is the only writer of `email`/`pendingEmail` on this path.
 * @param emailOutcome - {@link applyEmailChangeRequest}'s verdict for this request's `email`
 */
const writeProfile = (
    user: UserDocument,
    fields: ProfileFields,
    emailOutcome: EmailChangeOutcome,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    if (emailOutcome.conflict)
        return Promise.resolve(generateReject(409, [t('account.update.email-already-used')]));

    // A genuine change mails two addresses, so it is paced like the resend button: one a minute per
    // account. Answered before the mailbox budget is touched, so a paced request spends nothing.
    // The caller is signed in and the answer says nothing about any other account, so unlike the
    // reset request this can be honest about why.
    const wait = emailOutcome.requested
        ? resendCooldownRemaining(user, EMAIL_CHANGE_TOKEN_TYPE)
        : 0;
    if (wait > 0)
        return Promise.resolve(
            resendTooSoon(
                ERROR_CODES.EMAIL_CHANGE_TOO_SOON,
                t('account.email-change.too-soon'),
                wait
            )
        );

    // A genuine change mails the NEW address, which the caller chose: spent against that mailbox's
    // budget BEFORE anything is saved, so a refused change leaves `pendingEmail` as it was.
    const budget =
        emailOutcome.requested && user.pendingEmail
            ? mailRecipientRefusal(user.pendingEmail)
            : Promise.resolve(undefined);

    return budget.then((refusal) => {
        if (refusal) return refusal;

        return userService.update(user, fields, context).then((result) => {
            if (!result.success || !emailOutcome.requested) return result;
            return notifyEmailChangeRequested(result.data, context).then(() => result);
        });
    });
};

/**
 * Update the caller's own profile — email, username, locale, image.
 * Narrower than the admin `userService.update`: no `admin`/`active`/`password` — those belong to
 * `/users` and to {@link passwordChangeWithCurrent}, which proves the current password first.
 * `email` never reaches `userService.update` directly — {@link applyEmailChangeRequest} routes it
 * through `pendingEmail` instead, so `verified` (describing the account's CURRENT address) is
 * untouched by a change still waiting to be proven.
 */
export const updateProfile = (
    userId: string,
    data: unknown,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    const parseResult = zodProfileSchema.safeParse(data);

    const outcome: Promise<ResponseSuccess<UserDocument> | ResponseReject> = parseResult.success
        ? userService
              // Credentials included: a genuine email request follows with
              // `sendVerificationEmail`, which pushes a token onto this same document.
              .findByIdWithCredentials(userId)
              .then<ResponseSuccess<UserDocument> | ResponseReject>((user) => {
                  // A verified token for a since-deleted account is unauthenticated, not a
                  // 404 — `openapi.yaml` declares no 404 here, and `isAuth` treats this exact
                  // case (token valid, user gone) as 401 for every other route.
                  if (!user) return generateReject(401, []);

                  return applyEmailChangeRequest(user, parseResult.data.email).then(
                      (emailOutcome) => writeProfile(user, parseResult.data, emailOutcome, context)
                  );
              })
              .catch((error: unknown) => rejectDatabaseEnvelope('auth', error))
        : Promise.resolve(generateReject(422, validationErrors(parseResult.error)));

    return outcome.then((result) => {
        if (!result.success) return result;
        recordAudit(context, {
            action: accountAuditActions.AUTH_PROFILE_UPDATED,
            outcome: 'success'
        });
        return generateSuccess(result.data, 200, t('account.update.success'));
    });
};

/**
 * Change the password of a live session, gated on the current one.
 * A wrong current password is a 422 with translated copy, NOT a 401 — a 401 here reads as
 * "session expired" to client interceptors and would log out a perfectly valid session.
 * The new pair is validated BEFORE the current password is checked (both are pure reads): a
 * mistyped confirmation then costs one round-trip instead of a round-trip plus a bcrypt compare.
 */
export const passwordChangeWithCurrent = (
    userId: string,
    currentPassword: string,
    password: string,
    passwordConfirm: string,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    const errors = validatePasswordChange(password, passwordConfirm);

    const outcome: Promise<ResponseSuccess<UserDocument> | ResponseReject> =
        errors.length > 0
            ? Promise.resolve(generateReject(422, errors))
            : verifyOwnPassword(userId, currentPassword, 'account.password-change.wrong-current')
                  .then((verified) =>
                      verified.success
                          ? passwordChange(verified.data, password, passwordConfirm)
                          : verified
                  )
                  .catch((error: unknown) => rejectDatabaseEnvelope('auth', error));

    return outcome.then((result) => {
        recordAudit(context, {
            action: accountAuditActions.AUTH_PASSWORD_CHANGED,
            outcome: result.success ? 'success' : 'failure'
        });
        return result;
    });
};
