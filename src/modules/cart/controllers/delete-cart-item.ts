import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { cartService } from '../services';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import type { RemoveCartItemRequest } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { cartAnalyticsEvents } from '../analytics';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { cartAuditActions } from '../audit';
import { authContextOf, isValidObjectId, readInput } from '@infrastructure/http/request';
import { catchAs, refused } from '@infrastructure/http/controller';

/**
 * DELETE /cart/:productId
 * Remove a specific product from the cart. Returns the updated cart.
 * Service returns 404 if the item is not in the cart.
 */
export const deleteCartItem = (
    request: Request<{ productId?: string }, unknown, RemoveCartItemRequest>,
    response: Response
) => {
    const userId = authContextOf(request).id;
    // Path param only. `DELETE /cart/{productId}` declares no request body, and it could not use
    // one anyway: the route cannot match without the segment, so the param always wins the
    // precedence chain and a body `productId` was unreachable rather than merely undocumented.
    // (`PUT /cart/{productId}` keeps `body` because `UpdateCartItemByIdRequest` does declare it.)
    const { productId } = readInput(request, { surface: 'path', ids: ['productId'] });

    if (!isValidObjectId(productId)) {
        rejectResponse(response, 422, [t('generic.error-missing-data')]);
        return;
    }

    return cartService
        .cartItemRemoveById(userId, productId)
        .then((result) => {
            if (refused(response, result)) return;
            emitAuditEvent(
                buildAuditEvent(request, {
                    action: cartAuditActions.USER_CART_ITEM_REMOVED,
                    actor_user_id: userId,
                    actor_role: 'user',
                    outcome: 'success',
                    target_type: 'product',
                    target_id: productId
                })
            );
            emitAnalyticsEvent({
                ...buildAnalyticsBase(request),
                event: cartAnalyticsEvents.CART_ITEM_REMOVED,
                properties: { product_id: productId }
            });
            successResponse(response, result.data);
        })
        .catch(catchAs(response, 'deleteCartItem'));
};
