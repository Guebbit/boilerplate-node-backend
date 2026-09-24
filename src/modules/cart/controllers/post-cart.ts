/**
 * @module
 * `POST /cart` controller — thin HTTP adapter over `cartService.cartItemAdd`.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { UpsertCartItemBody } from '@api/schemas.zod';
import { cartService } from '../services';
import { successResponse } from '@infrastructure/http/response';
import type { CartResponse, UpsertCartItemRequest } from '@types';
import { requireObjectId, callerContextOf } from '@infrastructure/http/request';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/**
 * POST /cart
 * Add a product (with its quantity) to the cart — or replace the quantity of a line already there.
 * Eligibility (can this product be in a cart at all) is decided by the service, not here — the
 * same rule must hold for `PUT /cart/{productId}` and the wishlist's move-to-cart.
 */
export const postCart = (
    request: Request<unknown, unknown, UpsertCartItemRequest>,
    response: Response
) => {
    const userId = request.authContext!.id;

    const body = parseBody(UpsertCartItemBody, request.body, response);
    if (!body) return;

    const { productId, quantity } = body;

    // OpenAPI models Id as a plain string; Mongo-specific ObjectId format still needs its own check.
    if (!requireObjectId(response, productId)) return;

    return cartService
        .cartItemAdd(userId, productId, quantity, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            successResponse<CartResponse>(response, result.data, 200, t('cart.product-added'));
        })
        .catch(catchAs(response, 'upsertCartItem'));
};
