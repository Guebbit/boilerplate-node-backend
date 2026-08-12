import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { UpdateCartItemByIdBody } from '@api/schemas.zod';
import { cartService } from '../services';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import type { UpdateCartItemByIdRequest } from '@types';
import {
    emitAnalyticsEvent,
    analyticsEvents,
    buildAnalyticsBase
} from '@infrastructure/observability/analytics';
import { readInput, isValidObjectId } from '@infrastructure/http/request';

/**
 * PUT /cart/:productId
 * Set the quantity of a specific cart item. Returns the updated cart.
 */
export const putCartItem = (
    request: Request<{ productId?: string }, unknown, UpdateCartItemByIdRequest>,
    response: Response
) => {
    if (!request.authContext) {
        rejectResponse(response, 401);
        return;
    }
    const userId = request.authContext.id;

    const parseResult = UpdateCartItemByIdBody.safeParse(request.body);
    if (!parseResult.success)
        return rejectResponse(
            response,
            422,
            parseResult.error.issues.map(({ message }) => message)
        );

    const { quantity } = parseResult.data;
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
                event: analyticsEvents.CART_ITEM_UPDATED,
                properties: { product_id: productId, quantity }
            });
            successResponse(response, cart);
        })
        .catch((error: Error) => {
            rejectDatabaseError(response, 'updateCartItemById', error);
        });
};
