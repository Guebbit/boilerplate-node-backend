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
import type { OrderDocument } from '@modules/orders';
import { productService } from '@modules/products';
import type { ProductDocument } from '@modules/products';
import type { AuthContext } from '@types';
import type { CallerContext } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import { CART_LINE_MAX } from '../model';
import { cartAnalyticsEvents } from '../analytics';
import { cartAuditActions } from '../audit';
import { cartRepository, QUANTITY_LIMIT } from '../repository';
import { toCartView, type CartView } from './view';

/** A line the order asks for, resolved against today's catalogue. */
interface ReorderLine {
    productId: string;
    quantity: number;
    /** `null` when the product is gone, inactive or soft-deleted — not addable. */
    product: ProductDocument | null;
}

/**
 * Resolve an order's lines against today's catalogue, keeping only what can still be added.
 *
 * A vanished, inactive or soft-deleted product is dropped here, not refused — a single
 * unavailable line must not block the rest of the order. The caller rejects the whole reorder
 * only once none come through.
 * @param order - the order being reordered
 */
const resolveReorderLines = (order: OrderDocument): Promise<ReorderLine[]> => {
    const requested = order.items.map((item) => ({
        productId: String(item.product._id),
        quantity: item.quantity
    }));

    return Promise.all(
        requested.map(
            (line): Promise<ReorderLine> =>
                productService
                    .findPublicById(line.productId)
                    .then((product) => ({ ...line, product }))
        )
    ).then((lines) => lines.filter((line) => line.product !== null));
};

/**
 * Add each resolved line to the caller's cart, one line at a time.
 *
 * One at a time, in the original order: each `upsertLine` reads and rewrites the same cart
 * document, so a parallel add would lose lines to a last-write-wins race — which is also what
 * lets `quantities` below track each write without re-reading the cart per line.
 * @param userId - the caller whose cart is being filled
 * @param lines - the addable lines, as resolved by {@link resolveReorderLines}
 */
const addLinesToCart = async (userId: string, lines: ReorderLine[]): Promise<void> => {
    const existingCart = await cartRepository.findByUserId(userId);
    const quantities = new Map(
        (existingCart?.items ?? []).map((item) => [String(item.productId), item.quantity])
    );

    for (const line of lines) {
        const already = quantities.get(line.productId) ?? 0;
        const room = CART_LINE_MAX - already;
        if (room <= 0) continue;

        const added = Math.min(line.quantity, room);
        const result = await cartRepository.upsertLine(userId, line.productId, added, 'add');
        // QUANTITY_LIMIT here means `quantities` was already stale by write time (a
        // concurrent change to this same cart) — best-effort, so the line is skipped
        // rather than retried.
        if (result !== QUANTITY_LIMIT) quantities.set(line.productId, already + added);
    }
};

/**
 * Copy an order's lines back into the caller's cart.
 *
 * Scoped to the caller's OWN, still-visible orders — `ownerScope`, never `callerScope`:
 * `callerScope` is a ROLE-based read boundary (an admin's `orders.any.read` legitimately reads
 * every order for search/support), which is the wrong question for a feature that fills MY cart
 * from MY history — an admin reordering must not be able to refill their basket from a stranger's
 * purchase. `deletedAt: null` alongside it, since `ownerScope` alone (unlike `callerScope`,
 * whose `orders.self.read` condition already carries it) does not exclude a soft-deleted order.
 * Lines are re-resolved against today's catalogue via `findPublicById`, and a vanished/inactive
 * product is SKIPPED, not refused, unlike `./items`' `upsertCartItem` — a total skip answers 409
 * `REORDER_UNAVAILABLE` rather than an empty 200. A line already at (or requesting past)
 * `CART_LINE_MAX` is clamped to what room is left, and skipped outright once none is — the same
 * best-effort treatment as an unavailable product, not a refusal. Writes to the cart happen
 * sequentially; see {@link addLinesToCart} for why.
 */
export const reorderIntoCart = (
    authContext: AuthContext,
    orderId: string,
    context: CallerContext
): Promise<ResponseSuccess<CartView> | ResponseReject> => {
    const userId = authContext.id;

    return orderService
        .getById(orderId, { ...orderService.ownerScope(userId), deletedAt: null })
        .then<ResponseSuccess<CartView> | ResponseReject>((order) => {
            if (!order) return generateReject(404, [t('cart.reorder.order-not-found')]);

            return resolveReorderLines(order).then((addable) => {
                if (addable.length === 0)
                    return generateReject(409, [
                        {
                            code: 'REORDER_UNAVAILABLE',
                            message: t('cart.reorder.unavailable')
                        }
                    ]);

                return addLinesToCart(userId, addable).then(() =>
                    cartRepository
                        .findByUserId(userId)
                        .then((cart) => toCartView(cart))
                        .then((view) => generateSuccess(view, 200, t('cart.reorder.success')))
                );
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
