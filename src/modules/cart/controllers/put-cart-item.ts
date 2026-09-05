/**
 * @module
 * `PUT /cart/:productId` controller — thin HTTP adapter over `cartService.cartItemUpdateQuantity`.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { UpdateCartItemByIdBody } from '@api/schemas.zod';
import { cartService } from '../services';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import type { CartResponse, UpdateCartItemByIdRequest } from '@types';
import {
    authContextOf,
    isValidObjectId,
    readInput,
    callerContextOf
} from '@infrastructure/http/request';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/**
 * PUT /cart/:productId
 * Set the quantity of a specific cart item. Returns the updated cart.
 * Creates a line as readily as `POST /cart` does, so it shares the same 404 for a product the
 * storefront wouldn't show, from the same place: `cartItemSetById`.
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
        .cartItemUpdateQuantity(userId, productId, quantity, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            // `refused` narrows on `success` but not `result`'s type; `data` is always set here.
            successResponse<CartResponse>(response, result.data!);
        })
        .catch(catchAs(response, 'updateCartItemById'));
};
