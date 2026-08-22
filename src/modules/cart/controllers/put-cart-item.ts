import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { UpdateCartItemByIdBody } from '@api/schemas.zod';
import { cartService } from '../services';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import type { UpdateCartItemByIdRequest } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { cartAnalyticsEvents } from '../analytics';
import { authContextOf, isValidObjectId, readInput } from '@infrastructure/http/request';
import { catchAs, parseBody } from '@infrastructure/http/controller';

/**
 * PUT /cart/:productId
 * Set the quantity of a specific cart item. Returns the updated cart.
 */
export const putCartItem = (
    request: Request<{ productId?: string }, unknown, UpdateCartItemByIdRequest>,
    response: Response
) => {
    const userId = authContextOf(request).id;

    const body = parseBody(UpdateCartItemByIdBody, request.body, response);
    if (!body) return;

    const { quantity } = body;
    // productId travels via path param or body; body shape is already validated above.
    const { productId } = readInput(request, { surface: 'write', ids: ['productId'] });

    if (!isValidObjectId(productId)) {
        rejectResponse(response, 422, [t('generic.error-missing-data')]);
        return;
    }

    return cartService
        .cartItemSetById(userId, productId, quantity)
        .then((cart) => {
            emitAnalyticsEvent({
                ...buildAnalyticsBase(request),
                event: cartAnalyticsEvents.CART_ITEM_UPDATED,
                properties: { product_id: productId, quantity }
            });
            successResponse(response, cart);
        })
        .catch(catchAs(response, 'updateCartItemById'));
};
