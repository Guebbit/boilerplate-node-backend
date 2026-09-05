/**
 * @module
 * Reorder — an old order refilling the cart.
 *
 * Lives in cart, not orders, because of what it WRITES: the order is only read, the cart is what
 * changes, and `cart → orders` is the direction the manifests already declare. An
 * `/orders/{id}/reorder` route would have needed the orders module to reach into the cart —
 * the exact cycle the checkout arrow exists to avoid.
 */

import type { CastError } from 'mongoose';
import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import { orderRepository } from '@modules/orders';
import { productRepository } from '@modules/products';
import type { ProductDocument } from '@modules/products';
import type { CallerContext } from '@infrastructure/http/request';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { cartAnalyticsEvents } from '../analytics';
import { cartAuditActions } from '../audit';
import { cartRepository } from '../repository';
import { toCartView, type CartView } from './view';

/** A line the order asks for, resolved against today's catalogue. */
interface ReorderLine {
    productId: string;
    quantity: number;
    /** `null` when the product is gone, inactive or soft-deleted — not addable. */
    product: ProductDocument | null;
}

/**
 * Copy an order's lines back into the caller's cart.
 *
 * Scoped to the caller's OWN orders (`visibleScope`) — refilling someone else's purchases would
 * leak what they bought, not just misuse a privilege. Lines are re-resolved against today's
 * catalogue via `findPublicById`, and a vanished/inactive product is SKIPPED, not refused, unlike
 * `./items`' `upsertCartItem` — a total skip answers 409 `REORDER_UNAVAILABLE` rather than an
 * empty 200. Writes to the cart happen sequentially; see the loop below for why.
 */
export const reorderIntoCart = (
    userId: string,
    orderId: string,
    context: CallerContext
): Promise<ResponseSuccess<CartView> | ResponseReject> =>
    orderRepository
        .findByIdScoped(orderId, orderRepository.visibleScope(userId))
        .then<ResponseSuccess<CartView> | ResponseReject>((order) => {
            if (!order) return generateReject(404, [t('cart.reorder.order-not-found')]);

            /*
             * Scoped reads come back as NORMALIZED aggregate output — the embedded snapshot's
             * `_id` is already `id` — but the static type is still the document's. Read both
             * spellings rather than cast to one: this is the exact two-shapes trap
             * `orderService.getById` is known for, and a reader of either shape stays correct.
             */
            const requested = order.items.map((item) => {
                const snapshot = item.product as { id?: unknown; _id?: unknown };
                return {
                    productId: String(snapshot.id ?? snapshot._id),
                    quantity: item.quantity
                };
            });

            return Promise.all(
                requested.map(
                    (line): Promise<ReorderLine> =>
                        productRepository
                            .findPublicById(line.productId)
                            .then((product) => ({ ...line, product }))
                )
            ).then(async (lines) => {
                const addable = lines.filter((line) => line.product !== null);

                if (addable.length === 0)
                    return generateReject(409, [
                        {
                            code: 'REORDER_UNAVAILABLE',
                            message: t('cart.reorder.unavailable')
                        }
                    ]);

                /*
                 * One at a time, in the original order: each `upsertLine` reads and rewrites the
                 * same cart document, so a parallel add would lose lines to a last-write-wins race.
                 */
                for (const line of addable)
                    await cartRepository.upsertLine(userId, line.productId, line.quantity, 'add');

                return cartRepository
                    .findByUserId(userId)
                    .then((cart) => toCartView(cart))
                    .then((view) => generateSuccess(view, 200, t('cart.reorder.success')));
            });
        })
        .catch((error: CastError | Error) => rejectDatabaseEnvelope('cart', error))
        .then((result) => {
            if (result.success) {
                emitAuditEvent(
                    buildAuditEvent(context, {
                        action: cartAuditActions.USER_CART_REORDERED,
                        outcome: 'success',
                        metadata: { order_id: orderId }
                    })
                );
                emitAnalyticsEvent({
                    ...buildAnalyticsBase(context),
                    event: cartAnalyticsEvents.CART_REORDERED,
                    properties: { order_id: orderId }
                });
            }
            return result;
        });
