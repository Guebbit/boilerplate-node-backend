/**
 * @module
 * `DELETE /wishlist/:productId` controller — thin HTTP adapter over `wishlistService.wishlistRemove`.
 */

import type { Request, Response } from 'express';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
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
    const productId = requireId(request, response, {
        notFound: 'wishlist.not-found',
        name: 'productId'
    });
    if (!productId) return;

    return wishlistService
        .wishlistRemove(userId, productId, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            successResponse<WishlistResponse>(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'deleteWishlistItem'));
};
