/**
 * @module
 * `POST /wishlist/:productId/move-to-cart` controller — thin HTTP adapter over
 * `wishlistService.wishlistMoveToCart`.
 */

import type { Request, Response } from 'express';
import { callerContextOf, requireObjectId } from '@infrastructure/http/request';
import { successResponse } from '@infrastructure/http/response';
import { wishlistService } from '../service';
import { catchAs, refused } from '@infrastructure/http/controller';
import type { WishlistResponse } from '@types';

/**
 * POST /wishlist/:productId/move-to-cart
 * The wishlist's exit: one saved product becomes one cart line (quantity 1, incremented if the
 * cart already holds it), and leaves the wishlist. Cart write first, wishlist removal second —
 * see the service for why that order is the one a shopper can always repair.
 */
export const postMoveToCart = (request: Request<{ productId: string }>, response: Response) => {
    const userId = request.authContext!.id;
    const { productId } = request.params;

    if (!requireObjectId(response, productId)) return;

    return wishlistService
        .wishlistMoveToCart(userId, productId, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            successResponse<WishlistResponse>(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'postMoveToCart'));
};
