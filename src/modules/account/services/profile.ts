/**
 * @module
 * The profile a person edits about themselves: `PUT`/`PATCH /account`. The email starts at
 * `./email-change`, the password at `./password`.
 */

import type { ClientSession } from 'mongoose';
import {
    generateSuccess,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import { type UserDocument } from '@modules/users';
import { accountUserService } from '@modules/users/friends/account';
import type { CallerContext, UpdateAccountRequest } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import { accountAnalyticsEvents } from '../analytics';
import { accountAuditActions } from '../audit';
import { withOwnAccount } from './caller';
import { enqueueOutboxEvent, nudgeOutbox } from '@kernel/outbox';
import { ACCOUNT_ANALYTICS_CONSENT_WITHDRAWN } from '../events';

/**
 * Read the caller's own profile.
 * `findByIdWithPendingEmail`, not `accountUserService.getById`: that read is shared with the admin's
 * `get-user.ts` lookup, which has no business seeing a pending change, and the caller's own
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
    return accountUserService.findByIdWithPendingEmail(userId).then((user) => user ?? undefined);
};

/**
 * The fields `PUT /account` and `PATCH /account` both ultimately write, as the edge delivers them:
 * every one optional, since absence means "leave it alone" (`update-account.ts`'s PUT path has
 * already filled an omitted one with `null`). The image fields are not on the wire body — the
 * server, not the client, produces them, and the controller passes them from its own
 * `readUploadedImage` call.
 */
type ProfileFields = Partial<
    Pick<UpdateAccountRequest, 'username' | 'locale' | 'phone' | 'website' | 'analyticsConsent'>
> & {
    /** The server-decided path (`readUploadedImage`), or `null` to remove — never a client's string. */
    imageUrl?: string | null;
    thumbnailUrl?: string;
    pendingImageKey?: string;
};

/**
 * Persists the parsed fields. The consent withdrawal, when this call makes one, is announced in the
 * same transaction as the save.
 *
 * @param user - the loaded account
 * @param fields - the validated profile fields
 */
const writeProfile = (
    user: UserDocument,
    fields: ProfileFields
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    /**
     * Judged before the write assigns onto the document. Only a stored `true` has anything captured
     * under it: `undefined` never opted in, and `false → false` withdrew already.
     */
    const withdrawing = user.analyticsConsent === true && fields.analyticsConsent === false;

    // The outbox row commits with the save, so it exists exactly when the withdrawal does.
    const announceWithdrawal = withdrawing
        ? (session: ClientSession) =>
              enqueueOutboxEvent(
                  ACCOUNT_ANALYTICS_CONSENT_WITHDRAWN,
                  { userId: user.id },
                  user.id,
                  session
              )
        : undefined;

    return accountUserService.updateOwnProfile(user, fields, announceWithdrawal).then((result) => {
        if (withdrawing && result.success) nudgeOutbox();
        return result;
    });
};

/**
 * Update the caller's own profile — username, locale, image, phone, website, consent. `changes` are
 * already validated against the contract at the edge.
 * Narrower than the admin `userService.updateById`: no `admin`/`active`/`password` — those belong to
 * `/users` and to {@link passwordChangeWithCurrent}, which proves the current password first. No
 * `email` either: that starts at `POST /account/email-change`, see `./email-change`.
 */
export const updateProfile = (
    userId: string,
    changes: ProfileFields,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    /**
     * Credentials included by default: the update saves this same document. The shape was checked
     * once, at the edge (`update-account.ts`'s factory), so nothing here parses it again.
     */
    withOwnAccount(userId, (user) => {
        // Read before the write assigns onto the document.
        const metadata = accountUserService.userAuditChanges(user, changes);

        return writeProfile(user, changes).then((result) => {
            if (result.success)
                recordAudit(context, {
                    action: accountAuditActions.AUTH_PROFILE_UPDATED,
                    outcome: 'success',
                    metadata
                });
            return result;
        });
    })
        .catch((error: unknown) => rejectDatabaseEnvelope('auth', error))
        .then((result) => {
            if (!result.success) return result;
            return generateSuccess(result.data, 200);
        });
