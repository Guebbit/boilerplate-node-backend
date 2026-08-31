/**
 * @module
 * `DELETE /wishlist/:productId` controller — thin HTTP adapter over `wishlistService.wishlistRemove`.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { authContextOf, callerContextOf, isValidObjectId } from '@infrastructure/http/request';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { wishlistService } from '../service';
import { catchAs, refused } from '@infrastructure/http/controller';

/**
 * DELETE /wishlist/:productId
 * Remove one saved product. A line the caller cannot see is a 404 — their view is stale and
 * they need to know, the same contract the cart's remove keeps.
 */
export const deleteWishlistItem = (request: Request<{ productId: string }>, response: Response) => {
    const userId = authContextOf(request).id;
    const { productId } = request.params;

    if (!isValidObjectId(productId)) {
        // 422 rather than 404: the request is syntactically fine and its value is unusable,
        // which is what tells a caller the id was malformed rather than merely absent.
        rejectResponse(response, 422, [t('generic.error-missing-data')]);
        return;
    }

    return wishlistService
        .wishlistRemove(userId, productId, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            successResponse(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'deleteWishlistItem'));
};
