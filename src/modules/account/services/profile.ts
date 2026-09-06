/**
 * @module
 * The account a person manages about themselves — their profile fields, and their password.
 * Split from `./authentication` along the PROVING-vs-MAINTAINING line: login/signup answer "who
 * is this", everything here answers "change something about the account I'm already
 * authenticated as". The password belongs here since every flow that writes one is a change to
 * an existing account, not a way into it. See `./index` for why this module's service is a folder.
 */

import { z } from 'zod';
import { getDefaultLocale, t } from '@infrastructure/i18n';
import bcrypt from 'bcrypt';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { resetConfirmEmail, deleteConfirmEmail, emailChangeNoticeEmail } from '../emails';
import { sendVerificationEmail, EMAIL_CHANGE_TOKEN_TYPE } from './verification';
import type { CastError } from 'mongoose';
import { UpdateAccountBody } from '@api/schemas.zod';
import { analyticsConsentSchema } from '@infrastructure/http/schemas';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject,
    type ResponseErrorItem,
    validationErrors
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import {
    zodUserSchema,
    userRepository,
    userService,
    TokenType,
    type UserDocument
} from '@modules/users';
import type { CallerContext } from '@infrastructure/http/request';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { accountAnalyticsEvents } from '../analytics';
import { accountAuditActions } from '../audit';

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
 */
export const passwordChange = (
    user: UserDocument,
    password = '',
    passwordConfirm = ''
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    const errors = validatePasswordChange(password, passwordConfirm);

    if (errors.length > 0) return Promise.resolve(generateReject(422, errors));

    user.password = password;
    return userRepository
        .save(user)
        .then((savedUser) =>
            savedUser
                .tokenRemoveAll(TokenType.REFRESH)
                .catch(() => undefined)
                .then(() => generateSuccess<UserDocument>(savedUser))
        )
        .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error));
};

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
    return userRepository.findByIdWithPendingEmail(userId).then((user) => user ?? undefined);
};

/**
 * Change the password from a reset link, record it, and notify the account holder.
 * Wraps {@link passwordChange} rather than emitting inside it, since that function is also
 * `passwordChangeWithCurrent`'s last step (which reports its own `AUTH_PASSWORD_CHANGED`).
 * The mail is sent here, not by the controller, since "a password was reset" is a fact about
 * the account — any future caller gets the notification for free.
 */
export const passwordResetChange = (
    user: UserDocument,
    password: string,
    passwordConfirm: string,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    passwordChange(user, password, passwordConfirm).then((result) => {
        if (result.success) {
            emitAuditEvent(
                buildAuditEvent(context, {
                    action: accountAuditActions.AUTH_PASSWORD_RESET_COMPLETED,
                    actor_user_id: String(user._id),
                    actor_role: user.admin ? 'admin' : 'user',
                    outcome: 'success'
                })
            );

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
                user.locale ?? context.locale ?? getDefaultLocale(),
                user.username
            );
            void enqueueEmail({ to: user.email, subject: mail.subject }, mail.template, mail.data);
        }
        return result;
    });

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
     * addressed from a copy taken while the account still existed.
     */
    const { email, username, locale, _id, admin } = user;

    return userService.remove(user, true).then((result) => {
        if (result.success) {
            emitAuditEvent(
                buildAuditEvent(context, {
                    action: accountAuditActions.AUTH_ACCOUNT_DELETE_COMPLETED,
                    actor_user_id: String(_id),
                    actor_role: admin ? 'admin' : 'user',
                    outcome: 'success'
                })
            );
            emitAnalyticsEvent({
                ...buildAnalyticsBase(context),
                distinctId: String(_id),
                event: accountAnalyticsEvents.ACCOUNT_DELETED
            });

            // The recipient's own language first, the request's as fallback — see
            // {@link passwordResetChange} for why the request is only ever the fallback.
            const mail = deleteConfirmEmail(
                locale ?? context.locale ?? getDefaultLocale(),
                username
            );
            void enqueueEmail({ to: email, subject: mail.subject }, mail.template, mail.data);
        }
        return result;
    });
};

/**
 * What `PUT /account` accepts, validated with this codebase's messages.
 * `email`/`username` come from `zodUserSchema` (carries the i18n thunks); `locale`, `imageUrl`,
 * `phone`, `website` come straight from `UpdateAccountBody` — the contract's own constraints are
 * the whole rule. `.partial()` last: every field is optional, and absence means "leave it alone".
 */
const zodProfileSchema = zodUserSchema
    .pick({ email: true, username: true })
    .extend({
        locale: UpdateAccountBody.shape.locale,
        imageUrl: UpdateAccountBody.shape.imageUrl,
        phone: UpdateAccountBody.shape.phone,
        website: UpdateAccountBody.shape.website,
        // Absence still means "leave it alone", same as every other field here, not "withdraw
        // consent". `analyticsConsentSchema`, not `UpdateAccountBody.shape` directly: a multipart
        // request carries this as a string, and `'false'` is truthy.
        analyticsConsent: analyticsConsentSchema,
        // Not on `UpdateAccountBody` — both are `readOnly`/absent from the contract because the
        // server, not the client, produces them. They ride along here only because the controller
        // passes them from its own `readUploadedImage` call, the same way `imageUrl` does when an
        // upload — rather than a body value — is what set it.
        thumbnailUrl: z.string().optional(),
        pendingImageKey: z.string().optional()
    })
    .partial();

/**
 * Result of evaluating `PUT /account`'s `email` field against the pending-change rules — see
 * {@link applyEmailChangeRequest}. `requested` is true only when THIS call is what set
 * `pendingEmail`, which is what gates the old-address notice and the new verification link: a
 * plain cancellation or a profile update that never touched `email` sends neither.
 */
interface EmailChangeOutcome {
    conflict: boolean;
    requested: boolean;
}

/**
 * Applies `PUT /account`'s `email` field to `user.pendingEmail` — never straight to `user.email`.
 * The account keeps its current, PROVEN address until the new one is confirmed through
 * `POST /account/email-change-confirm` (`EMAIL_VERIFICATION_PLAN.md`).
 *
 * Three outcomes: an absent field leaves everything alone; the CURRENT address cancels whatever
 * change was pending — cheaper than a dedicated endpoint, and what a user retyping their real
 * address would naturally do; any OTHER address is checked against every account's `email` AND
 * `pendingEmail` before being accepted. That check is the REQUEST-TIME half of the collision
 * rule — `users_pending_email` and `users_email` (both unique) are the swap-time half, since the
 * two are up to 24 hours apart and only the indexes are still there for both.
 *
 * Mutates `user` in place; the caller's own `save()` (inside `userService.update`) persists it.
 * @param user - the loaded document; must carry `pendingEmail` (`findByIdWithCredentials`)
 * @param requestedEmail - `parseResult.data.email`, or `undefined` when the field was omitted
 */
const applyEmailChangeRequest = (
    user: UserDocument,
    requestedEmail: string | undefined
): Promise<EmailChangeOutcome> => {
    if (requestedEmail === undefined) return Promise.resolve({ conflict: false, requested: false });

    if (requestedEmail === user.email) {
        user.pendingEmail = undefined;
        return Promise.resolve({ conflict: false, requested: false });
    }

    return userRepository.emailOrPendingEmailTaken(requestedEmail, user.id).then((taken) => {
        if (taken) return { conflict: true, requested: false };
        user.pendingEmail = requestedEmail;
        return { conflict: false, requested: true };
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
    const locale = user.locale ?? context.locale ?? getDefaultLocale();
    const mail = emailChangeNoticeEmail(locale, user.username, user.pendingEmail ?? '');
    return enqueueEmail(
        { to: user.email, subject: mail.subject },
        mail.template,
        mail.data,
        'high'
    ).then(() => sendVerificationEmail(user, context, EMAIL_CHANGE_TOKEN_TYPE));
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
        ? userRepository
              // Credentials included: a genuine email request follows with
              // `sendVerificationEmail`, which pushes a token onto this same document.
              .findByIdWithCredentials(userId)
              .then<ResponseSuccess<UserDocument> | ResponseReject>((user) => {
                  // A verified token for a since-deleted account is unauthenticated, not a
                  // 404 — `openapi.yaml` declares no 404 here, and `isAuth` treats this exact
                  // case (token valid, user gone) as 401 for every other route.
                  if (!user) return generateReject(401, []);

                  return applyEmailChangeRequest(user, parseResult.data.email).then(
                      (emailOutcome) => {
                          if (emailOutcome.conflict)
                              return generateReject(409, [t('account.update.email-already-used')]);

                          // `email` is never forwarded — `applyEmailChangeRequest` above is the
                          // only writer of `email`/`pendingEmail` from this endpoint.
                          return userService
                              .update(user, { ...parseResult.data, email: undefined })
                              .then((result) => {
                                  if (!result.success || !result.data || !emailOutcome.requested)
                                      return result;

                                  return sendEmailChangeMail(result.data, context).then(() => {
                                      emitAuditEvent(
                                          buildAuditEvent(context, {
                                              action: accountAuditActions.AUTH_EMAIL_CHANGE_REQUESTED,
                                              outcome: 'success'
                                          })
                                      );
                                      return result;
                                  });
                              });
                      }
                  );
              })
              .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error))
        : Promise.resolve(generateReject(422, validationErrors(parseResult.error)));

    return outcome.then((result) => {
        if (result.success)
            emitAuditEvent(
                buildAuditEvent(context, {
                    action: accountAuditActions.AUTH_PROFILE_UPDATED,
                    outcome: 'success'
                })
            );
        return result;
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
            : userRepository
                  // `password` is select:false — comparing against it is this flow's whole point.
                  .findByIdWithCredentials(userId)
                  .then<ResponseSuccess<UserDocument> | ResponseReject>((user) => {
                      // Same rule as `updateProfile`: gone-but-verified is 401, not a 404
                      // `openapi.yaml` never declares here.
                      if (!user) return generateReject(401, []);

                      // An OAuth-only account (`account/oauth/link.ts`) holds no password to prove
                      // against — same 422 as a wrong one, since this flow has no other way in.
                      if (!user.password)
                          return generateReject(422, [t('account.password-change.wrong-current')]);

                      return bcrypt.compare(currentPassword, user.password).then((doMatch) => {
                          if (!doMatch)
                              return generateReject(422, [
                                  t('account.password-change.wrong-current')
                              ]);
                          return passwordChange(user, password, passwordConfirm);
                      });
                  })
                  .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error));

    return outcome.then((result) => {
        emitAuditEvent(
            buildAuditEvent(context, {
                action: accountAuditActions.AUTH_PASSWORD_CHANGED,
                outcome: result.success ? 'success' : 'failure'
            })
        );
        return result;
    });
};
