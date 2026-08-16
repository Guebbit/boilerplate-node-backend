import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { wishlistService } from '../service';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { wishlistAnalyticsEvents } from '../analytics';

/**
 * POST /wishlist/:productId/move-to-cart
 * The wishlist's exit: one saved product becomes one cart line (quantity 1, incremented if the
 * cart already holds it), and leaves the wishlist. Cart write first, wishlist removal second —
 * see the service for why that order is the one a shopper can always repair.
 */
export const postMoveToCart = (request: Request<{ productId: string }>, response: Response) => {
    if (!request.authContext) {
        rejectResponse(response, 401);
        return;
    }
    const userId = request.authContext.id;
    const { productId } = request.params;

    return wishlistService
        .wishlistMoveToCart(userId, productId)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.errors);
                return;
            }

            emitAnalyticsEvent({
                ...buildAnalyticsBase(request),
                event: wishlistAnalyticsEvents.WISHLIST_MOVED_TO_CART,
                properties: { product_id: productId }
            });

            successResponse(response, result.data, 200, result.message);
        })
        .catch((error: CastError | Error) => {
            rejectDatabaseError(response, 'postMoveToCart', error);
        });
};
