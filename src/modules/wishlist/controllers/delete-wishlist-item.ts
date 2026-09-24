/**
 * @module
 * `DELETE /wishlist/:productId` controller — thin HTTP adapter over `wishlistService.wishlistRemove`.
 */

import type { Request, Response } from 'express';
import { callerContextOf, requireObjectId } from '@infrastructure/http/request';
import { successResponse } from '@infrastructure/http/response';
import { wishlistService } from '../service';
import { catchAs, refused } from '@infrastructure/http/controller';
import type { WishlistResponse } from '@types';

/**
 * DELETE /wishlist/:productId
 * Remove one saved product. A line the caller cannot see is a 404 — their view is stale and
 * they need to know, the same contract the cart's remove keeps.
 */
export const deleteWishlistItem = (request: Request<{ productId: string }>, response: Response) => {
    const userId = request.authContext!.id;
    const { productId } = request.params;

    if (!requireObjectId(response, productId)) return;

    return wishlistService
        .wishlistRemove(userId, productId, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            successResponse<WishlistResponse>(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'deleteWishlistItem'));
};
