/**
 * @module
 * Whether an order's lines are still sellable, and what happens when one of them stops being so
 * — a hard delete or a deactivation, reported by `products`. `orders` asks `productService` fresh
 * rather than trusting the order's own frozen snapshot, since `active`/`deletedAt` on a line
 * describe what was true at PURCHASE time, never now.
 */

import { getDefaultLocale } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { SYSTEM_ACTOR } from '@kernel/permissions';
import { productService } from '@modules/products';
import { userService } from '@modules/users';
import { orderRepository } from '../repository';
import { productUnavailableCancelledEmail } from '../emails';
import { cancelById } from './cancel';

/** One line whose product a buyer could no longer actually get. */
export interface UnavailableLine {
    productId: string;
    title: string;
}

/**
 * One order line, read loosely enough to cover both shapes `unavailableLines` is ever handed: a
 * hydrated `OrderDocument`'s embedded `OrderDocumentItem` (`product._id`), or the already-wire
 * `Order` contract's `OrderItem` (`product.id`) — see `productIdOf`. Exported only because
 * `unavailableLines`'s parameter type names it — never meant as a general-purpose type.
 */
export interface OrderLineSource {
    product: { id?: unknown; _id?: unknown; title: string };
}

/**
 * The embedded product's id, read off whichever spelling this order's shape carries — a hydrated
 * (admin/unscoped) read keeps the raw `_id`, but a SCOPED read (`findByIdScoped`'s aggregate
 * branch) has already gone through `applyOrderTransform`, which rewrites it to `id`. The exact
 * two-shapes trap `cart/services/reorder.ts`'s own docblock names for the same reason.
 */
const productIdOf = (item: OrderLineSource): string => String(item.product.id ?? item.product._id);

/**
 * Which of this order's lines point at a product that is no longer sellable — hard-deleted,
 * soft-deleted or deactivated. `productService.findManyByIds` is unscoped (it has to be: a
 * hard-deleted product answers with nothing at all, which is itself the "gone" signal), so
 * visibility is decided HERE, the same two conditions `publicScope()` checks.
 *
 * @param order - the order to check; only `items` is read
 * @returns the unavailable lines, empty when every line is still sellable
 */
export const unavailableLines = (order: {
    items: readonly OrderLineSource[];
}): Promise<UnavailableLine[]> => {
    const productIds = order.items.map((item) => productIdOf(item));

    return productService.findManyByIds(productIds).then((found) => {
        const stillSellable = new Set(
            found
                .filter((product) => product.active && !product.deletedAt)
                .map((product) => String(product._id))
        );

        return order.items
            .filter((item) => !stillSellable.has(productIdOf(item)))
            .map((item) => ({ productId: productIdOf(item), title: item.product.title }));
    });
};

/**
 * Cancel every still-`pending` order holding `productId`, and tell each buyer why — the
 * `PRODUCT_DELETED` (hard-delete half only, see `module.ts`) and `PRODUCT_DEACTIVATED` listeners'
 * own job. Deliberately its own email, not `cancel.ts`'s `bank_transfer`-only reservation-expiry
 * one: this happens with no warning the buyer could have expected, so it always deserves an
 * explanation, `card` orders included. One order failing to cancel (a race past `pending`, an
 * unrelated write conflict) must not stop the rest — each is caught and logged on its own.
 *
 * @param productId - the product that just stopped being sellable
 */
export const cancelPendingOrdersHolding = (productId: string): Promise<void> =>
    orderRepository.findPendingByProductId(productId).then((orders) =>
        Promise.all(
            orders.map((order) =>
                cancelById(String(order._id), SYSTEM_ACTOR)
                    .then((result) => {
                        if (!result.success) return undefined;

                        const line = order.items.find((item) => productIdOf(item) === productId);
                        const buyerLookup = order.userId
                            ? userService.getById(String(order.userId))
                            : Promise.resolve(undefined);

                        return buyerLookup.then((buyer) => {
                            const locale = buyer?.locale ?? getDefaultLocale();
                            const mail = productUnavailableCancelledEmail(locale, [
                                { title: line?.product.title ?? productId }
                            ]);
                            void enqueueEmail(
                                { to: order.email, subject: mail.subject },
                                mail.template,
                                mail.data
                            );
                        });
                    })
                    .catch((error: unknown) => {
                        // Stryker disable all
                        logger.error({
                            message:
                                'Failed to cancel a pending order for a product that stopped being sellable.',
                            orderId: String(order._id),
                            productId,
                            error
                        });
                        // Stryker restore all
                    })
            )
        ).then(() => undefined)
    );
