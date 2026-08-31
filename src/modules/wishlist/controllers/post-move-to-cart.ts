/**
 * @module
 * `POST /wishlist/:productId/move-to-cart` controller — thin HTTP adapter over
 * `wishlistService.wishlistMoveToCart`.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { authContextOf, callerContextOf, isValidObjectId } from '@infrastructure/http/request';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { wishlistService } from '../service';
import { catchAs, refused } from '@infrastructure/http/controller';

/**
 * POST /wishlist/:productId/move-to-cart
 * The wishlist's exit: one saved product becomes one cart line (quantity 1, incremented if the
 * cart already holds it), and leaves the wishlist. Cart write first, wishlist removal second —
 * see the service for why that order is the one a shopper can always repair.
 */
export const postMoveToCart = (request: Request<{ productId: string }>, response: Response) => {
    const userId = authContextOf(request).id;
    const { productId } = request.params;

    if (!isValidObjectId(productId)) {
        // 422 rather than 404: the request is syntactically fine and its value is unusable,
        // which is what tells a caller the id was malformed rather than merely absent.
        rejectResponse(response, 422, [t('generic.error-missing-data')]);
        return;
    }

    return wishlistService
        .wishlistMoveToCart(userId, productId, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            successResponse(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'postMoveToCart'));
};
