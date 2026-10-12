/**
 * @module
 * The profile a person edits about themselves: `PUT`/`PATCH /account`. The email field is handed
 * to `./email-change`, the password to `./password`.
 */

import { z } from 'zod';
import { t } from '@infrastructure/i18n';
import { mailRecipientRefusal } from '../mail-budget';
import { resendCooldownRemaining, EMAIL_CHANGE_TOKEN_TYPE } from './verification';
import { resendTooSoon } from '../cooldown';
import { ERROR_CODES } from '@api/error-codes';
import { UpdateAccountBody } from '@api/schemas.zod';
import { optionalBooleanSchema } from '@infrastructure/http/schemas';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject,
    validationErrors
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import { zodUserSchema, userService, type UserDocument } from '@modules/users';
import type { CallerContext } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import { accountAnalyticsEvents } from '../analytics';
import { accountAuditActions } from '../audit';
import {
    applyEmailChangeRequest,
    notifyEmailChangeRequested,
    type EmailChangeOutcome
} from './email-change';

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
 * The fields `PUT/PATCH /account` accepts, after parsing — the input half of {@link writeProfile}.
 */
type ProfileFields = z.infer<typeof zodProfileSchema>;

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
