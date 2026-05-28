import type { Request, Response } from 'express';
import { cartService } from '@services/cart';
import { successResponse, rejectResponse } from '@utils/response';
import type { RemoveCartItemRequest } from '@types';
import { emitAnalyticsEvent, AnalyticsEvent } from '@utils/analytics';
import { emitAuditEvent, extractRequestContext, AuditAction } from '@utils/audit';
import { getActiveSpanContext } from '@utils/tracer';

/**
 * DELETE /cart/:productId
 * Remove a specific product from the cart. Returns the updated cart.
 * Service returns 404 if the item is not in the cart.
 */
export const deleteCartItem = (
    request: Request<{ productId?: string }, unknown, RemoveCartItemRequest>,
    response: Response
) => {
    const userId = request.authContext!.id;
    const productId = String(request.params.productId ?? request.body.productId);

<<<<<<< HEAD
    const existing = user.cart.items.find((i) => i.product.equals(productId));
    if (!existing) {
        rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
        return Promise.resolve();
    }

    return userService
        .cartItemRemoveById(user, productId)
        .then(() => userService.cartGetWithSummary(user))
        .then((cart) => {
            emitAuditEvent({
                action: AuditAction.USER_CART_ITEM_REMOVED,
                actor_user_id: user.id,
                actor_role: user.admin ? 'admin' : 'user',
                outcome: 'success',
                target_type: 'product',
                target_id: productId,
                ...extractRequestContext(request)
            });
            emitAnalyticsEvent({
                distinctId: user.id,
                event: AnalyticsEvent.CART_ITEM_REMOVED,
                traceId: getActiveSpanContext().traceId,
                properties: { product_id: productId }
=======
    return cartService
        .cartItemRemoveById(userId, productId)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.message, result.errors);
                return;
            }
            return cartService.cartGetWithSummary(userId).then((cart) => {
                emitAnalyticsEvent({
                    distinctId: userId,
                    event: AnalyticsEvent.CART_ITEM_REMOVED,
                    traceId: getActiveSpanContext().traceId,
                    properties: { product_id: productId }
                });
                successResponse(response, cart);
>>>>>>> origin/main
            });
        });
};
