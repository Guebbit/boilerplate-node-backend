import type { Request, Response } from 'express';
import { authContextOf, callerContextOf } from '@infrastructure/http/request';
import { successResponse } from '@infrastructure/http/response';
import { malformedProductId } from './shared/product-id';
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

    if (malformedProductId(response, productId)) return;

    return wishlistService
        .wishlistRemove(userId, productId, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            successResponse(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'deleteWishlistItem'));
};
