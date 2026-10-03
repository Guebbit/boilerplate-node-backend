/**
 * @module
 * `PUT /wishlist/:productId` controller — thin HTTP adapter over `wishlistService.wishlistAdd`.
 */

import type { Request, Response } from 'express';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { successResponse } from '@infrastructure/http/response';
import type { WishlistResponse } from '@types';
import { wishlistService } from '../service';
import { catchAs, refused } from '@infrastructure/http/controller';

/**
 * PUT /wishlist/:productId
 * Save a product. "This product is saved" is a yes/no state on a URI, which is what PUT states:
 * no body, and saving what is already saved answers the same 200 (RFC 9110 §9.3.4) — a
 * double-clicked heart icon is not an error anyone wants reported. Pairs with the DELETE on the
 * same URI (GitHub's `PUT`/`DELETE /user/starred/{owner}/{repo}` is the same pattern).
 */
export const putWishlistItem = (request: Request<{ productId: string }>, response: Response) => {
    const userId = request.authContext!.id;
    const productId = requireId(request, response, {
        notFound: 'wishlist.product-not-found',
        name: 'productId'
    });
    if (!productId) return;

    return wishlistService
        .wishlistAdd(userId, productId, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            successResponse<WishlistResponse>(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'putWishlistItem'));
};
