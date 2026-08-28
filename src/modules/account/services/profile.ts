/**
 * The account a person manages about themselves — their profile fields, and their password.
 *
 * Split from `./authentication` along the line between PROVING an identity and MAINTAINING one:
 * login and signup answer "who is this", everything here answers "change something about the
 * account I am already authenticated as". The password sits on this side of that line because
 * every flow that writes one — the reset link, the logged-in change — is a change to an existing
 * account rather than a way into it.
 *
 * See `./index` for why this module's service is a folder.
 */

import { z } from 'zod';
import { getDefaultLocale, t } from '@infrastructure/i18n';
import bcrypt from 'bcrypt';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { resetConfirmEmail, deleteConfirmEmail } from '../emails';
import type { CastError } from 'mongoose';
import { UpdateAccountBody } from '@api/schemas.zod';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject,
    type ResponseErrorItem,
    validationErrors
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import { zodUserSchema, userRepository, userService, type UserDocument } from '@modules/users';
import type { CallerContext } from '@infrastructure/http/request';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { accountAnalyticsEvents } from '../analytics';
import { accountAuditActions } from '../audit';

/**
 * Validate a new-password pair without touching the user.
 *
 * Split out of {@link passwordChange} so `reset-confirm` can check the body BEFORE it spends the
 * one-time token. The order matters: consuming the token is what resolves two simultaneous uses
 * of one reset link, so it has to happen before the password is written — but a link burned by a
 * typo'd confirmation would be a poor trade for that. Validating first means only a well-formed
 * request can spend the token.
 *
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
 * Change user password with validation.
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
        .then((savedUser) => generateSuccess<UserDocument>(savedUser))
        .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error));
};

/**
 * Read the caller's own profile.
 *
 * A wrapper rather than an emit inside `userService.getById` itself: that read is shared with
 * `users/controllers/get-user-item.ts` (an admin looking up someone else's account), and an
 * unconditional `user_profile_viewed` there would count every admin lookup as the user's own
 * profile view. This is the one caller for whom that event is actually true.
 */
export const getOwnProfile = (userId: string, context: CallerContext) => {
    emitAnalyticsEvent({
        ...buildAnalyticsBase(context),
        event: accountAnalyticsEvents.USER_PROFILE_VIEWED
    });
    return userService.getById(userId);
};

/**
 * Change the password from a reset link, record that it happened, and tell the account holder.
 *
 * A wrapper around {@link passwordChange} rather than an emit inside it: that function is also
 * `passwordChangeWithCurrent`'s last step, which reports its own `AUTH_PASSWORD_CHANGED` action —
 * an emit inside `passwordChange` itself would double up on that flow and misname this one's.
 *
 * The mail is published here rather than by the controller because "a password was reset" is a
 * fact about the account, not about the HTTP request that carried it: a second caller of this
 * function gets the notification without having to remember it. `context.locale` is what makes
 * that possible — see `CallerContext`.
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
 *
 * A wrapper around `userService.remove` rather than an emit inside it: `remove` is also
 * `removeById`'s last step, reached from the admin `DELETE /users/:id`, which already reports its
 * own `ADMIN_USER_DELETED` from `createDeleteController`. An emit inside `remove` itself would
 * fire on the admin path too, and — worse than a duplicate — would misattribute it: this event's
 * `actor_user_id`/`actor_role` are the deleted account's own, correct for a self-delete but
 * backwards for an admin's, where they would report the person removed as the one who acted.
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
 *
 * `email` and `username` come from `zodUserSchema`, whose overrides carry the i18n thunks;
 * `locale` and `imageUrl` come straight from the generated `UpdateAccountBody`, because the
 * contract's own constraints (the BCP 47 pattern) are the whole rule and need no custom copy.
 * `.partial()` last: every field of a self-service update is optional, and an absent field means
 * "leave it alone".
 */
const zodProfileSchema = zodUserSchema
    .pick({ email: true, username: true })
    .extend({
        locale: UpdateAccountBody.shape.locale,
        imageUrl: UpdateAccountBody.shape.imageUrl
    })
    .partial();

/**
 * Update the caller's own profile — email, username, locale, image.
 *
 * Deliberately narrower than the admin `userService.update`: no `admin`, no `active`, no
 * `password`. Role and account state are the `/users` endpoints' to change, and the password has
 * its own flow ({@link passwordChangeWithCurrent}) because it must prove knowledge of the current
 * one.
 *
 * Changing the email UNVERIFIES the account before the write: the old confirmation vouched for
 * the old address, and carrying it over would let one verified mailbox launder any number of
 * addresses. The caller decides whether to start a fresh verification — the controller sends the
 * email so this function stays queue-free.
 *
 * A duplicate email surfaces as the unique index's E11000, which `rejectDatabaseEnvelope` already
 * answers as 409 — the same path signup takes, so the two flows cannot disagree about what "taken"
 * looks like.
 */
export const updateProfile = (
    userId: string,
    data: unknown,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    const parseResult = zodProfileSchema.safeParse(data);

    const outcome: Promise<ResponseSuccess<UserDocument> | ResponseReject> = parseResult.success
        ? userRepository
              // Credentials included: the caller may follow a successful email change with
              // `sendVerificationEmail`, which pushes a token onto this same document.
              .findByIdWithCredentials(userId)
              .then<ResponseSuccess<UserDocument> | ResponseReject>((user) => {
                  if (!user) return generateReject(404, []);

                  if (parseResult.data.email !== undefined && parseResult.data.email !== user.email)
                      user.verified = false;

                  return userService.update(user, parseResult.data);
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
 *
 * The email reset proves possession of the mailbox; this proves possession of the credential
 * being replaced. A wrong current password is a 422 with translated copy, NOT a 401 — a 401 from
 * an authenticated endpoint reads as "session expired" to every client interceptor, and would log
 * the user out of a session that is perfectly valid.
 *
 * The new pair is validated BEFORE the current password is checked. Both are pure reads so no
 * order is unsafe; this one means a mistyped confirmation costs one round-trip instead of one
 * bcrypt comparison plus one round-trip.
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
                      if (!user) return generateReject(404, []);

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
