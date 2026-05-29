import type { Request, Response } from 'express';
import { t } from 'i18next';
import { cartService } from '@services/cart';
import { successResponse, rejectResponse } from '@utils/response';
import type { RemoveCartItemRequest } from '@types';
import { emitAnalyticsEvent, AnalyticsEvent, buildAnalyticsBase } from '@utils/analytics';
import { emitAuditEvent, AuditAction, buildAuditEvent } from '@utils/audit';
import { extractCustomId, isValidObjectId } from '@utils/helpers-request';

/**
 * DELETE /cart/:productId
 * Remove a specific product from the cart. Returns the updated cart.
 * Service returns 404 if the item is not in the cart.
 */
export const deleteCartItem = (
    request: Request<{ productId?: string }, unknown, RemoveCartItemRequest>,
    response: Response
) => {
    if (!request.authContext) {
        rejectResponse(response, 401, 'Unauthorized');
        return;
    }
    const userId = request.authContext.id;
    const productId = extractCustomId(request, { param: 'productId', body: 'productId' });

    if (!isValidObjectId(productId)) {
        rejectResponse(response, 422, 'removeCartItem - missing id', [
            t('generic.error-missing-data')
        ]);
        return;
    }

    return cartService.cartItemRemoveById(userId, productId).then((result) => {
        if (!result.success) {
            rejectResponse(response, result.status, result.message, result.errors);
            return;
        }
        return cartService.cartGetWithSummary(userId).then((cart) => {
            emitAuditEvent(
                buildAuditEvent(request, {
                    action: AuditAction.USER_CART_ITEM_REMOVED,
                    actor_user_id: userId,
                    actor_role: 'user',
                    outcome: 'success',
                    target_type: 'product',
                    target_id: productId
                })
            );
            emitAnalyticsEvent({
                ...buildAnalyticsBase(request),
                event: AnalyticsEvent.CART_ITEM_REMOVED,
                properties: { product_id: productId }
            });
            successResponse(response, cart);
        });
    });
};
