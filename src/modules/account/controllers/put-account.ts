/**
 * @module
 * `PUT /account` controller — thin HTTP adapter over `accountService.updateProfile`, plus the
 * uploaded-image cleanup that rides along with a self-service edit. A changed email's side
 * effects (the pending-change notice, the fresh verification link) are `updateProfile`'s own
 * business — see docs/modules/account.md#proving-an-address — not the controller's.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { readUploadedImage } from '@infrastructure/http/uploads';
import type { UpdateAccountRequest, UpdateAccountRequestMultipart, User } from '@types';
import { accountService } from '../services';
import { callerContextOf } from '@infrastructure/http/request';
import { userService } from '@modules/users';

/**
 * PUT /account — the authenticated user updates their OWN profile (email, username, locale,
 * image, phone, website).
 * This is why a normal user can edit at all: `/users` writes sit behind `requirePermission`, which would
 * 403 a caller lacking the `users.*` key doing self-service through them.
 */
export const putAccount = (
    // `| undefined` for the reason `post-signup` gives: express 5 leaves the body unset when no
    // parser matched, multipart route or not.
    request: Request<
        unknown,
        unknown,
        UpdateAccountRequest | UpdateAccountRequestMultipart | undefined
    >,
    response: Response
) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = request.authContext!;

    // No `= ''` default here, unlike the create paths: `updateProfile` treats an absent
    // `imageUrl` as "not sent" and leaves the stored one alone, where `''` would clear it.
    const { imageUrl, thumbnailUrl, pendingImageKey, deleteUpload } = readUploadedImage(request);

    /*
     * Read through the request's own declared type rather than parsed against `UpdateAccountBody`,
     * for the reason `post-signup` gives: `accountService.updateProfile` validates these fields
     * with translated messages, and the generated schema would answer first in English. No further
     * cast needed: every field read here is common to both `request.body`'s own union members.
     */
    const { email, username, locale, phone, website, analyticsConsent } = request.body ?? {};

    return accountService
        .updateProfile(
            id,
            {
                email,
                username,
                locale,
                imageUrl,
                thumbnailUrl,
                pendingImageKey,
                phone,
                website,
                analyticsConsent
            },
            callerContextOf(request)
        )
        .then((result) => {
            if (!result.success)
                return deleteUpload()
                    .catch(() => undefined)
                    .then(() => {
                        rejectResponse(response, result.status, result.errors);
                    });

            const { data } = result;

            // The role comes straight off the already-resolved auth context, same as
            // `get-account.ts` — a profile edit never changes it, so no second lookup here.
            successResponse<User>(
                response,
                userService.toUser(data, request.authContext!.roles.tenant),
                200,
                t('account.update.success')
            );
        })
        .catch((error: unknown) => {
            rejectDatabaseError(response, 'putAccount', error);
            // The response is already sent — a rejected cleanup must not become an unhandled
            // promise rejection on top of it.
            return deleteUpload().catch(() => undefined);
        });
};
