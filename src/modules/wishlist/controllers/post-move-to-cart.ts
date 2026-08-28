import type { Request, Response } from 'express';
import { authContextOf, callerContextOf } from '@infrastructure/http/request';
import { successResponse } from '@infrastructure/http/response';
import { malformedProductId } from './shared/product-id';
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

    if (malformedProductId(response, productId)) return;

    return wishlistService
        .wishlistMoveToCart(userId, productId, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            successResponse(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'postMoveToCart'));
};
