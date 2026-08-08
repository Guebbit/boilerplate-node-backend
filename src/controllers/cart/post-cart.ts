import type { Request, Response } from 'express';
import { t } from '@core/i18n';
import { UpsertCartItemBody } from '@api/schemas.zod';
import { cartService } from '@services/cart';
import { productService } from '@services/products';
import { successResponse, rejectResponse } from '@core/http/response';
import type { UpsertCartItemRequest } from '@types';
import {
    emitAnalyticsEvent,
    AnalyticsEvent,
    buildAnalyticsBase
} from '@core/observability/analytics';
import { isValidObjectId } from '@core/http/request';

/**
 * POST /cart
 * Add a product (with its quantity) to the cart.
 * Checks product availability, then sets (or replaces) the quantity in the cart.
 */
export const postCart = (
    request: Request<unknown, unknown, UpsertCartItemRequest>,
    response: Response
) => {
    if (!request.authContext) {
        rejectResponse(response, 401, 'Unauthorized');
        return;
    }
    const userId = request.authContext.id;

    const parseResult = UpsertCartItemBody.safeParse(request.body);
    if (!parseResult.success)
        return rejectResponse(
            response,
            422,
            'upsertCartItem - invalid data',
            parseResult.error.issues.map(({ message }) => message)
        );

    const { productId, quantity } = parseResult.data;

    // OpenAPI models Id as a plain string; Mongo-specific ObjectId format still needs its own check.
    if (!isValidObjectId(productId)) {
        rejectResponse(response, 422, 'upsertCartItem - missing id', [
            t('generic.error-missing-data')
        ]);
        return;
    }

    return productService
        .getById(productId)
        .then((product) => {
            if (!product) {
                rejectResponse(response, 404, 'upsertCartItem - product not found', [
                    t('ecommerce.product-not-found')
                ]);
                return;
            }

            return cartService.cartItemSetById(userId, productId, quantity).then((cart) => {
                emitAnalyticsEvent({
                    ...buildAnalyticsBase(request),
                    event: AnalyticsEvent.CART_ITEM_ADDED,
                    properties: { product_id: productId, quantity }
                });
                successResponse(response, cart, 200, t('ecommerce.product-added-to-cart'));
            });
        })
        .catch((error: Error) => {
            rejectResponse(response, 500, 'upsertCartItem', [error.message]);
        });
};
