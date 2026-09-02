/**
 * @module
 * `PUT /account` controller — thin HTTP adapter over `accountService.updateProfile`, plus the
 * uploaded-image cleanup and re-verification trigger that ride along with a self-service edit.
 */

import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { t } from '@infrastructure/i18n';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { readUploadedImage } from '@infrastructure/adapters/image-store';
import type { UpdateAccountRequest, UpdateAccountRequestMultipart } from '@types';
import { accountService } from '../services';
import { sendVerificationEmail } from '../services';
import { authContextOf, callerContextOf } from '@infrastructure/http/request';

/**
 * PUT /account — the authenticated user updates their OWN profile (email, username, locale,
 * image, phone, website).
 * This is why a normal user can edit at all: `/users` writes sit behind `isAdmin`, which would
 * 403 every non-admin doing self-service through them.
 */
export const putAccount = (
    request: Request<unknown, unknown, UpdateAccountRequest | UpdateAccountRequestMultipart>,
    response: Response
) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id, email: currentEmail } = authContextOf(request);

    // No `= ''` default here, unlike the create paths: `updateProfile` treats an absent
    // `imageUrl` as "not sent" and leaves the stored one alone, where `''` would clear it.
    const { imageUrl, thumbnailUrl, pendingImageKey, deleteUpload } = readUploadedImage(request);

    /*
     * Read through the request type rather than parsed against `UpdateAccountBody`, for the reason
     * `post-signup` gives: `accountService.updateProfile` validates these fields with translated
     * messages, and the generated schema would answer first in English.
     */
    const { email, username, locale, phone, website, analyticsConsent } =
        request.body as UpdateAccountRequest;

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
                return deleteUpload().then(() => {
                    rejectResponse(response, result.status, result.errors);
                });

            /*
             * A changed address restarts verification: `updateProfile` has already unset
             * `verified`, and the fresh link goes to the NEW address — proving the mailbox that
             * now backs the account, not the one that used to. Fire-and-forget like every other
             * account email; the response does not wait on the queue.
             */
            if (email !== undefined && email !== currentEmail && result.data)
                void sendVerificationEmail(result.data, callerContextOf(request));

            successResponse(response, result.data, 200, t('account.update.success'));
        })
        .catch((error: CastError | Error) => {
            rejectDatabaseError(response, 'putAccount', error);
            return deleteUpload();
        });
};
