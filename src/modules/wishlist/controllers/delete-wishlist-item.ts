import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { t } from '@infrastructure/i18n';
import { isValidObjectId } from '@infrastructure/http/request';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { wishlistService } from '../service';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { wishlistAnalyticsEvents } from '../analytics';

/**
 * DELETE /wishlist/:productId
 * Remove one saved product. A line the caller cannot see is a 404 — their view is stale and
 * they need to know, the same contract the cart's remove keeps.
 */
export const deleteWishlistItem = (request: Request<{ productId: string }>, response: Response) => {
    if (!request.authContext) {
        rejectResponse(response, 401);
        return;
    }
    const userId = request.authContext.id;
    const { productId } = request.params;

    // OpenAPI models Id as a plain string; the Mongo-specific format still needs its own check,
    // and answering 422 is what tells a caller the id was malformed rather than absent.
    if (!isValidObjectId(productId)) {
        rejectResponse(response, 422, [t('generic.error-missing-data')]);
        return;
    }

    return wishlistService
        .wishlistRemove(userId, productId)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.errors);
                return;
            }

            emitAnalyticsEvent({
                ...buildAnalyticsBase(request),
                event: wishlistAnalyticsEvents.WISHLIST_ITEM_REMOVED,
                properties: { product_id: productId }
            });

            successResponse(response, result.data, 200, result.message);
        })
        .catch((error: CastError | Error) => {
            rejectDatabaseError(response, 'deleteWishlistItem', error);
        });
};
