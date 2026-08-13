import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { AddWishlistItemBody } from '@api/schemas.zod';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import type { AddWishlistItemRequest } from '@types';
import { wishlistService } from '../service';
import {
    emitAnalyticsEvent,
    analyticsEvents,
    buildAnalyticsBase
} from '@infrastructure/observability/analytics';

/**
 * POST /wishlist
 * Save a product. Idempotent — saving what is already saved answers the same 200, because a
 * double-clicked heart icon is not an error anyone wants reported.
 */
export const postWishlist = (
    request: Request<unknown, unknown, AddWishlistItemRequest>,
    response: Response
) => {
    if (!request.authContext) {
        rejectResponse(response, 401);
        return;
    }
    const userId = request.authContext.id;

    const parseResult = AddWishlistItemBody.safeParse(request.body);
    if (!parseResult.success)
        return rejectResponse(
            response,
            422,
            parseResult.error.issues.map(({ message }) => message)
        );

    const { productId } = parseResult.data;

    return wishlistService
        .wishlistAdd(userId, productId)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.errors);
                return;
            }

            emitAnalyticsEvent({
                ...buildAnalyticsBase(request),
                event: analyticsEvents.WISHLIST_ITEM_ADDED,
                properties: { product_id: productId }
            });

            successResponse(response, result.data, 200, result.message);
        })
        .catch((error: CastError | Error) => {
            rejectDatabaseError(response, 'postWishlist', error);
        });
};
