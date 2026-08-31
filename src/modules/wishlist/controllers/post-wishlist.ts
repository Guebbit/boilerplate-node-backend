/**
 * @module
 * `POST /wishlist` controller — thin HTTP adapter over `wishlistService.wishlistAdd`.
 */

import type { Request, Response } from 'express';
import { AddWishlistItemBody } from '@api/schemas.zod';
import { t } from '@infrastructure/i18n';
import { authContextOf, callerContextOf, isValidObjectId } from '@infrastructure/http/request';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import type { AddWishlistItemRequest } from '@types';
import { wishlistService } from '../service';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/**
 * POST /wishlist
 * Save a product. Idempotent — saving what is already saved answers the same 200, because a
 * double-clicked heart icon is not an error anyone wants reported.
 */
export const postWishlist = (
    request: Request<unknown, unknown, AddWishlistItemRequest>,
    response: Response
) => {
    const userId = authContextOf(request).id;

    const body = parseBody(AddWishlistItemBody, request.body, response);
    if (!body) return;

    const { productId } = body;

    if (!isValidObjectId(productId)) {
        // 422 rather than 404: the request is syntactically fine and its value is unusable,
        // which is what tells a caller the id was malformed rather than merely absent.
        rejectResponse(response, 422, [t('generic.error-missing-data')]);
        return;
    }

    return wishlistService
        .wishlistAdd(userId, productId, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            successResponse(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'postWishlist'));
};
