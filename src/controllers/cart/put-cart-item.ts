import type { Request, Response } from 'express';
import { t } from '@core/i18n';
import { UpdateCartItemByIdBody } from '@api/schemas.zod';
import { cartService } from '@services/cart';
import { successResponse, rejectResponse } from '@core/http/response';
import type { UpdateCartItemByIdRequest } from '@types';
import {
    emitAnalyticsEvent,
    AnalyticsEvent,
    buildAnalyticsBase
} from '@core/observability/analytics';
import { readInput, isValidObjectId } from '@core/http/request';

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

    const parseResult = UpdateCartItemByIdBody.safeParse(request.body);
    if (!parseResult.success)
        return rejectResponse(
            response,
            422,
            'updateCartItemById - invalid data',
            parseResult.error.issues.map(({ message }) => message)
        );

    const { quantity } = parseResult.data;
    // productId travels via path param or body; body shape is already validated above.
    const { productId } = readInput(request, { sources: ['params', 'body'], ids: ['productId'] });

    if (!isValidObjectId(productId)) {
        rejectResponse(response, 422, 'updateCartItemById - missing id', [
            t('generic.error-missing-data')
        ]);
        return;
    }

    return cartService
        .cartItemSetById(userId, productId, quantity)
        .then((cart) => {
            emitAnalyticsEvent({
                ...buildAnalyticsBase(request),
                event: AnalyticsEvent.CART_ITEM_UPDATED,
                properties: { product_id: productId, quantity }
            });
            successResponse(response, cart);
        })
        .catch((error: Error) => {
            rejectResponse(response, 500, 'updateCartItemById', [error.message]);
        });
};
