/**
 * @module
 * `PUT /cart/:productId` controller — thin HTTP adapter over `cartService.cartItemUpdateQuantity`.
 */

import type { Request, Response } from 'express';
import { UpdateCartItemByIdBody } from '@api/schemas.zod';
import { cartService } from '../services';
import { createdResponse, successResponse } from '@infrastructure/http/response';
import type { CartResponse, UpdateCartItemByIdRequest } from '@types';
import { requireObjectId, readInput, callerContextOf } from '@infrastructure/http/request';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/**
 * PUT /cart/:productId
 * Set the quantity of a specific cart item. Returns the updated cart — 201 when it created the
 * line (RFC 9110 §9.3.4), 200 when it wrote one already there. Shares `POST /cart`'s 404 for a
 * product the storefront wouldn't show, from the same place: `upsertCartItem`.
 */
export const putCartItem = (
    request: Request<{ productId?: string }, unknown, UpdateCartItemByIdRequest>,
    response: Response
) => {
    const userId = request.authContext!.id;

    const body = parseBody(UpdateCartItemByIdBody, request.body, response);
    if (!body) return;

    const { quantity } = body;
    // productId is the path segment; the body carries only the quantity.
    const { productId } = readInput(request, { surface: 'write', ids: ['productId'] });

    if (!requireObjectId(response, productId)) return;

    return cartService
        .cartItemUpdateQuantity(userId, productId, quantity, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            if (result.status === 201)
                createdResponse<CartResponse>(response, result.data, `/cart/${productId}`);
            else successResponse<CartResponse>(response, result.data);
        })
        .catch(catchAs(response, 'updateCartItemById'));
};
