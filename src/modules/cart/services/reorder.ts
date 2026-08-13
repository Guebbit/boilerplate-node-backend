/**
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
    type IResponseSuccess,
    type IResponseReject
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import { toObjectId } from '@infrastructure/persistence/base-repository';
import { orderRepository } from '@modules/orders';
import { productRepository } from '@modules/products';
import type { IProductDocument } from '@modules/products';
import { cartRepository } from '../repository';
import { toCartView, type ICartView } from './view';

/** A line the order asks for, resolved against today's catalogue. */
interface IReorderLine {
    productId: string;
    quantity: number;
    /** `null` when the product is gone, inactive or soft-deleted — not addable. */
    product: IProductDocument | null;
}

/**
 * Copy an order's lines back into the caller's cart.
 *
 * Scoped to the caller's OWN orders — `visibleScope`, admin or not — because the cart being
 * filled is the caller's: reordering someone else's purchases into your basket is not a
 * privilege, it is a leak of what they bought.
 *
 * The order carries product SNAPSHOTS, so each line is re-resolved against the catalogue as it
 * is today, through `publicScope`: a product that has since been deleted, deactivated or hidden
 * is skipped rather than re-added, exactly as it could not be added from the product page. The
 * quantities come from the order; an item already in the cart is INCREMENTED, matching what
 * "add to cart" does everywhere else.
 *
 * Skipping everything is a refusal, not a success: an order whose every product has vanished
 * answers 409 with `REORDER_UNAVAILABLE`, because "your cart now holds none of what you asked
 * for" is not an outcome to dress as 200. A partial skip is reported by the answer itself — the
 * cart view carries what actually landed.
 *
 * Writes are sequential on purpose. Parallel upserts against one cart document all fight the
 * unique `userId` index and resolve by retry; a reduce chain issues them one at a time and needs
 * none.
 */
export const reorderIntoCart = (
    userId: string,
    orderId: string
): Promise<IResponseSuccess<ICartView> | IResponseReject> =>
    orderRepository
        .findByIdScoped(orderId, orderRepository.visibleScope(userId))
        .then<IResponseSuccess<ICartView> | IResponseReject>((order) => {
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
                    (line): Promise<IReorderLine> =>
                        productRepository
                            .findOne({
                                _id: toObjectId(line.productId),
                                ...productRepository.publicScope()
                            })
                            .then((product) => ({ ...line, product }))
                )
            ).then((lines) => {
                const addable = lines.filter((line) => line.product !== null);

                if (addable.length === 0)
                    return generateReject(409, [
                        {
                            code: 'REORDER_UNAVAILABLE',
                            message: t('cart.reorder.unavailable')
                        }
                    ]);

                const addAllInOrder = async (): Promise<void> => {
                    for (const line of addable)
                        await cartRepository.upsertLine(
                            userId,
                            line.productId,
                            line.quantity,
                            'add'
                        );
                };

                return addAllInOrder()
                    .then(() => cartRepository.findByUserId(userId))
                    .then((cart) => toCartView(cart))
                    .then((view) => generateSuccess(view, 200, t('cart.reorder.success')));
            });
        })
        .catch((error: CastError | Error) => rejectDatabaseEnvelope('cart', error));
