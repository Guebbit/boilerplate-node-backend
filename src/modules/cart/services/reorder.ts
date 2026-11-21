/**
 * @module
 * Reorder — an old order refilling the cart.
 *
 * Lives in cart, not orders, because of what it WRITES: the order is only read, the cart is what
 * changes, and `cart → orders` is the direction the manifests already declare. An
 * `/orders/{id}/reorder` route would have needed the orders module to reach into the cart —
 * the exact cycle the checkout arrow exists to avoid.
 */

import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import { orderService } from '@modules/orders';
import type { AuthContext, CallerContext } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import { cartAnalyticsEvents } from '../analytics';
import { cartAuditActions } from '../audit';
import { mergeLines, type MergeResult } from './merge';
import { lineLimitReached } from './items';
import { toCartView } from './view';
import { ERROR_CODES } from '@api/error-codes';

/**
 * Copy an order's lines back into the caller's cart.
 *
 * Scoped to the caller's OWN, still-visible orders — `ownLiveScope`, never `callerScope`:
 * `callerScope` is a ROLE-based read boundary (an admin's `display:Order` legitimately reads
 * every order for search/support), which is the wrong question for a feature that fills MY cart
 * from MY history — an admin reordering must not be able to refill their basket from a stranger's
 * purchase. `ownLiveScope` carries `deletedAt: null`, so a soft-deleted order is excluded as it is
 * for `callerScope`.
 *
 * The lines go through the merge's own rule ({@link mergeLines}), so the two cannot disagree and
 * the answer is the same per-line report: a vanished or hidden product is `removed`, a line past
 * `cartLineMax()` is `capped` to what room is left, a new product in a cart already holding
 * `cartMaxLines()` is `cart_full`. None of that is a failure, unlike
 * `./items`' `upsertCartItem`; only an order with nothing addable at all answers 409 rather than an
 * empty 200: `CART_LINE_LIMIT_REACHED` if any line found the cart full, else `REORDER_UNAVAILABLE`.
 */
export const reorderIntoCart = (
    authContext: AuthContext,
    orderId: string,
    context: CallerContext
): Promise<ResponseSuccess<MergeResult> | ResponseReject> => {
    const userId = authContext.id;

    return orderService
        .getById(orderId, orderService.ownLiveScope(userId))
        .then<ResponseSuccess<MergeResult> | ResponseReject>((order) => {
            if (!order) return generateReject(404, [t('cart.reorder.order-not-found')]);

            const requested = order.items.map((item) => ({
                productId: String(item.product._id),
                quantity: item.quantity
            }));

            return mergeLines(userId, requested, context).then(({ cart: written, lines }) => {
                /**
                 * Nothing landed: every line is gone from the catalogue or found the cart full.
                 * A full cart is the news the shopper can act on, so it is the one named.
                 */
                const unaddable = lines.every(
                    ({ reason }) => reason === 'removed' || reason === 'cart_full'
                );
                if (unaddable && lines.some(({ reason }) => reason === 'cart_full'))
                    return lineLimitReached();
                if (unaddable)
                    return generateReject(409, [
                        {
                            code: ERROR_CODES.REORDER_UNAVAILABLE,
                            message: t('cart.reorder.unavailable')
                        }
                    ]);

                return toCartView(written).then((cart) => generateSuccess({ cart, lines }, 200));
            });
        })
        .catch((error: unknown) => rejectDatabaseEnvelope('cart', error))
        .then((result) => {
            if (result.success) {
                recordAudit(context, {
                    action: cartAuditActions.USER_CART_REORDERED,
                    outcome: 'success',
                    metadata: { order_id: orderId }
                });
                emitAnalyticsEvent({
                    ...buildAnalyticsBase(context),
                    event: cartAnalyticsEvents.CART_REORDERED,
                    properties: { order_id: orderId }
                });
            }
            return result;
        });
};
