/**
 * @module
 * `POST /wishlist/items` controller — thin HTTP adapter over `wishlistService.add`.
 */

import type { Request, Response } from 'express';
import { CreateWishlistItemBody } from '@api/schemas.zod';
import { callerContextOf } from '@infrastructure/http/request';
import { successResponse } from '@infrastructure/http/response';
import type { CreateWishlistItemRequest, WishlistResponse } from '@types';
import { wishlistService } from '../service';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/**
 * POST /wishlist/items
 * Save a product. A saved product is a line of the caller's wishlist, written through its parent:
 * 200 + the whole wishlist, no `Location`, and saving what is already saved answers the same 200
 * with nothing fired twice, so a double-clicked heart icon is not an error anyone wants reported.
 */
export const postWishlistItems = (
    request: Request<unknown, unknown, CreateWishlistItemRequest>,
    response: Response
) => {
    const userId = request.authContext!.id;

    // `parseBody` refuses a `productId` that is not this backend's id (422).
    const body = parseBody(CreateWishlistItemBody, request.body, response);
    if (!body) return;

    return wishlistService
        .add(userId, body.productId, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            successResponse<WishlistResponse>(response, result.data, 200);
        })
        .catch(catchAs(response, 'createWishlistItem'));
};
