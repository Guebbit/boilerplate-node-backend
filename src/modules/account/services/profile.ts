/**
 * @module
 * The profile a person edits about themselves: `PUT`/`PATCH /account`. The email field is handed
 * to `./email-change`, the password to `./password`.
 */

import { t } from '@infrastructure/i18n';
import { mailRecipientRefusal } from '../mail-budget';
import { resendCooldownRemaining } from './verification';
import { EMAIL_CHANGE_TOKEN_TYPE } from '../token-types';
import { resendTooSoon } from '../cooldown';
import { ERROR_CODES } from '@api/error-codes';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import { userService, type UserDocument } from '@modules/users';
import type { CallerContext, UpdateAccountRequest } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import { accountAnalyticsEvents } from '../analytics';
import { accountAuditActions } from '../audit';
import {
    applyEmailChangeRequest,
    notifyEmailChangeRequested,
    type EmailChangeOutcome
} from './email-change';
import { withOwnAccount } from './caller';

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
 * The fields `PUT /account` and `PATCH /account` both ultimately write, as the edge delivers them:
 * every one optional, since absence means "leave it alone" (`update-account.ts`'s PUT path has
 * already filled an omitted one with `null`). The image fields are not on the wire body — the
 * server, not the client, produces them, and the controller passes them from its own
 * `readUploadedImage` call.
 */
type ProfileFields = Partial<
    Pick<
        UpdateAccountRequest,
        'email' | 'username' | 'locale' | 'phone' | 'website' | 'analyticsConsent'
    >
> & {
    /** The server-decided path (`readUploadedImage`), or `null` to remove — never a client's string. */
    imageUrl?: string | null;
    thumbnailUrl?: string;
    pendingImageKey?: string;
};

/**
 * The tail of {@link writeProfile} once the change is not paced: the mailbox budget, the write,
 * and the two mails a genuine email change owes.
 *
 * @param user - the loaded account
 * @param fields - the validated profile fields
 * @param emailOutcome - what {@link applyEmailChangeRequest} decided
 * @param context - the caller
 */
const saveProfile = (
    user: UserDocument,
    fields: ProfileFields,
    emailOutcome: EmailChangeOutcome,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    // A genuine change mails the NEW address, which the caller chose: spent against that mailbox's
    // budget BEFORE anything is saved, so a refused change leaves `pendingEmail` as it was.
    const budget =
        emailOutcome.requested && user.pendingEmail
            ? mailRecipientRefusal(user.pendingEmail, context)
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
    return (
        emailOutcome.requested
            ? resendCooldownRemaining(user, EMAIL_CHANGE_TOKEN_TYPE)
            : Promise.resolve(0)
    ).then((wait) => {
        if (wait > 0)
            return resendTooSoon(
                ERROR_CODES.EMAIL_CHANGE_TOO_SOON,
                t('account.email-change.too-soon'),
                wait
            );

        return saveProfile(user, fields, emailOutcome, context);
    });
};

/**
 * Update the caller's own profile — email, username, locale, image. `changes` are already validated
 * against the contract at the edge.
 * Narrower than the admin `userService.update`: no `admin`/`active`/`password` — those belong to
 * `/users` and to {@link passwordChangeWithCurrent}, which proves the current password first.
 * `email` never reaches `userService.update` directly — {@link applyEmailChangeRequest} routes it
 * through `pendingEmail` instead, so `verified` (describing the account's CURRENT address) is
 * untouched by a change still waiting to be proven.
 */
export const updateProfile = (
    userId: string,
    changes: ProfileFields,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    // Credentials included by default: the update saves this same document. The shape was checked
    // once, at the edge (`update-account.ts`'s factory), so nothing here parses it again.
    withOwnAccount(userId, (user) =>
        applyEmailChangeRequest(user, changes.email).then((emailOutcome) =>
            writeProfile(user, changes, emailOutcome, context)
        )
    )
        .catch((error: unknown) => rejectDatabaseEnvelope('auth', error))
        .then((result) => {
            if (!result.success) return result;
            recordAudit(context, {
                action: accountAuditActions.AUTH_PROFILE_UPDATED,
                outcome: 'success'
            });
            return generateSuccess(result.data, 200, t('account.update.success'));
        });
