import type { Request, Response } from 'express';
import { AddWishlistItemBody } from '@api/schemas.zod';
import { t } from '@infrastructure/i18n';
import { authContextOf, isValidObjectId } from '@infrastructure/http/request';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import type { AddWishlistItemRequest } from '@types';
import { wishlistService } from '../service';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { wishlistAnalyticsEvents } from '../analytics';
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

    // OpenAPI models Id as a plain string; the Mongo-specific format still needs its own check,
    // and answering 422 is what tells a caller the id was malformed rather than absent.
    if (!isValidObjectId(productId)) {
        rejectResponse(response, 422, [t('generic.error-missing-data')]);
        return;
    }

    return wishlistService
        .wishlistAdd(userId, productId)
        .then((result) => {
            if (refused(response, result)) return;

            emitAnalyticsEvent({
                ...buildAnalyticsBase(request),
                event: wishlistAnalyticsEvents.WISHLIST_ITEM_ADDED,
                properties: { product_id: productId }
            });

            successResponse(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'postWishlist'));
};
