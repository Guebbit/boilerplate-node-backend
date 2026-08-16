import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { UpsertCartItemBody } from '@api/schemas.zod';
import { cartService } from '../services';
import { productService } from '@modules/products';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import type { UpsertCartItemRequest } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { cartAnalyticsEvents } from '../analytics';
import { isValidObjectId } from '@infrastructure/http/request';

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
        rejectResponse(response, 401);
        return;
    }
    const userId = request.authContext.id;

    const parseResult = UpsertCartItemBody.safeParse(request.body);
    if (!parseResult.success)
        return rejectResponse(
            response,
            422,
            parseResult.error.issues.map(({ message }) => message)
        );

    const { productId, quantity } = parseResult.data;

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
        .catch((error: Error) => {
            rejectDatabaseError(response, 'upsertCartItem', error);
        });
};
