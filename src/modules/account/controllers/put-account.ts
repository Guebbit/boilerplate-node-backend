import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { t } from '@infrastructure/i18n';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { resolveImageUrl } from '@infrastructure/http/uploads';
import { imageStore } from '@infrastructure/adapters/image-store';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import type { UpdateAccountRequest, UpdateAccountRequestMultipart } from '@types';
import { accountService } from '../services';
import { accountAuditActions } from '../audit';
import { sendVerificationEmail } from '../services';

/**
 * PUT /account
 * The authenticated user updates their OWN profile — email, username, locale, image.
 *
 * This endpoint is why a normal user can edit their profile at all: the `/users` writes sit
 * behind `isAdmin`, and self-service going through them answered every non-admin a 403.
 */
export const putAccount = (
    request: Request<unknown, unknown, UpdateAccountRequest | UpdateAccountRequestMultipart>,
    response: Response
) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id, email: currentEmail } = request.authContext!;

    /**
     * Uploaded file takes priority over body imageUrl — the same merge signup does.
     */
    const imageUrlFile = resolveImageUrl(request as Request);
    const imageUrl = imageUrlFile ?? (request.body as { imageUrl?: string }).imageUrl;
    // On failure remove the image THIS request uploaded — `imageUrlFile`, never the merged
    // value: a body-supplied url names an image this request did not create.
    const deleteUpload = () => imageStore.remove(imageUrlFile);

    const { email, username, locale } = request.body as UpdateAccountRequest;

    return accountService
        .updateProfile(id, { email, username, locale, imageUrl })
        .then((result) => {
            if (!result.success)
                return deleteUpload().then(() => {
                    rejectResponse(response, result.status, result.errors);
                });

            emitAuditEvent(
                buildAuditEvent(request, {
                    action: accountAuditActions.AUTH_ACCOUNT_UPDATED,
                    outcome: 'success'
                })
            );

            /*
             * A changed address restarts verification: `updateProfile` has already unset
             * `verified`, and the fresh link goes to the NEW address — proving the mailbox that
             * now backs the account, not the one that used to. Fire-and-forget like every other
             * account email; the response does not wait on the queue.
             */
            if (email !== undefined && email !== currentEmail && result.data)
                void sendVerificationEmail(result.data, request.locale);

            successResponse(response, result.data, 200, t('account.update.success'));
        })
        .catch((error: CastError | Error) => {
            rejectDatabaseError(response, 'putAccount', error);
            return deleteUpload();
        });
};
