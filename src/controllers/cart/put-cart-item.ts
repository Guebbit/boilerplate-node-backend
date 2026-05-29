import type { Request, Response } from 'express';
import { t } from 'i18next';
import { cartService } from '@services/cart';
import { successResponse, rejectResponse } from '@utils/response';
import type { UpdateCartItemByIdRequest } from '@types';
import { emitAnalyticsEvent, AnalyticsEvent, buildAnalyticsBase } from '@utils/analytics';
import { extractCustomId, isValidObjectId } from '@utils/helpers-request';

/**
 * PUT /cart/:productId
 * Set the quantity of a specific cart item. Returns the updated cart.
 */
export const putCartItem = (
    request: Request<{ productId?: string }, unknown, UpdateCartItemByIdRequest>,
    response: Response
) => {
    if (!request.authContext) {
        rejectResponse(response, 401, 'Unauthorized');
        return;
    }
    const userId = request.authContext.id;
    const productId = extractCustomId(request, { param: 'productId', body: 'productId' });

    if (!isValidObjectId(productId)) {
        rejectResponse(response, 422, 'updateCartItemById - missing id', [
            t('generic.error-missing-data')
        ]);
        return;
    }

    if (!request.body.quantity || request.body.quantity < 1) {
        rejectResponse(response, 422, 'updateCartItemById - invalid quantity', [
            t('generic.error-invalid-data')
        ]);
        return;
    }

    return cartService
        .cartItemSetById(userId, productId, request.body.quantity)
        .then(() => cartService.cartGetWithSummary(userId))
        .then((cart) => {
            emitAnalyticsEvent({
                ...buildAnalyticsBase(request),
                event: AnalyticsEvent.CART_ITEM_UPDATED,
                properties: { product_id: productId, quantity: request.body.quantity }
            });
            successResponse(response, cart);
        })
        .catch((error: Error) => {
            rejectResponse(response, 500, 'updateCartItemById', [error.message]);
        });
};
