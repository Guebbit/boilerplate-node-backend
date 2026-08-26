import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { UpsertCartItemBody } from '@api/schemas.zod';
import { cartService } from '../services';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import type { UpsertCartItemRequest } from '@types';
import { authContextOf, isValidObjectId, callerContextOf } from '@infrastructure/http/request';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/**
 * POST /cart
 * Add a product (with its quantity) to the cart — or replace the quantity of a line already there.
 *
 * Whether the product may be in a cart at all is the SERVICE's answer, not this file's: the same
 * rule has to hold for `PUT /cart/{productId}` and for the wishlist's move-to-cart, and a check
 * written here would only ever cover this route.
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

    return cartService
        .cartItemAdd(userId, productId, quantity, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            successResponse(response, result.data, 200, t('cart.product-added'));
        })
        .catch(catchAs(response, 'upsertCartItem'));
};
