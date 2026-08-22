import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { UpsertCartItemBody } from '@api/schemas.zod';
import { cartService } from '../services';
import { productService } from '@modules/products';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import type { UpsertCartItemRequest } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { cartAnalyticsEvents } from '../analytics';
import { authContextOf, isValidObjectId } from '@infrastructure/http/request';
import { catchAs, parseBody } from '@infrastructure/http/controller';

/**
 * POST /cart
 * Add a product (with its quantity) to the cart.
 * Checks product availability, then sets (or replaces) the quantity in the cart.
 */
export const postCart = (
    request: Request<unknown, unknown, UpsertCartItemRequest>,
    response: Response
) => {
    const userId = authContextOf(request).id;

    const body = parseBody(UpsertCartItemBody, request.body, response);
    if (!body) return;

    const { productId, quantity } = body;

    // OpenAPI models Id as a plain string; Mongo-specific ObjectId format still needs its own check.
    if (!isValidObjectId(productId)) {
        rejectResponse(response, 422, [t('generic.error-missing-data')]);
        return;
    }

    return productService
        .getById(productId)
        .then((product) => {
            if (!product) {
                rejectResponse(response, 404, [t('products.not-found')]);
                return;
            }

            return cartService.cartItemSetById(userId, productId, quantity).then((cart) => {
                emitAnalyticsEvent({
                    ...buildAnalyticsBase(request),
                    event: cartAnalyticsEvents.CART_ITEM_ADDED,
                    properties: { product_id: productId, quantity }
                });
                successResponse(response, cart, 200, t('cart.product-added'));
            });
        })
        .catch(catchAs(response, 'upsertCartItem'));
};
