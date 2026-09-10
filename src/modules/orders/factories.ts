/**
 * @module
 * How an order row is built. An order item embeds a product SNAPSHOT (`orderItemSchema`
 * declares `product: orderLineProductSchema` with no `ref`), so this builder takes the snapshot
 * as a value rather than an id to look up later. It deliberately carries no `onHand`/`reserved` —
 * the embedded schema has nowhere to put them, same reasoning as `deletedAt`'s absence: a
 * catalogue soft-delete or a stock count says nothing about an order already placed — and no
 * totals, since those are derived at serialization time by `applyOrderTransform` rather than
 * stored.
 */

import { Types } from 'mongoose';
import { getDefaultLocale } from '@infrastructure/i18n';
import {
    identityOf,
    stripUndefined,
    toDate,
    type OverridesFor
} from '@infrastructure/persistence/factories';
import type { ProductSnapshot } from '@modules/products';
import type { Id, Order, OrderItem, Product } from '@types';
import type { OrderDocument } from './model';

/**
 * The product as it was when the order was placed — the generated `Product`, with the three
 * fields a snapshot must carry made required, and `onHand`/`reserved` dropped: the embedded
 * schema has no path for either, so a fixture that pinned one would silently lose it on write.
 * `createdAt`/`updatedAt` are the CATALOGUE row's, carried in explicitly: a subdocument's
 * timestamps stamp on insert regardless of the parent's `{ timestamps: false }`, which would
 * otherwise make every export non-deterministic.
 */
export type OrderSnapshotInput = Omit<OverridesFor<Product>, 'onHand' | 'reserved'> &
    Required<Pick<Product, 'id' | 'title' | 'price'>>;

/**
 * One line of an order: the snapshot, and how many were bought.
 *
 * `locale` is optional here, unlike the contract's `OrderItem`: a fixture usually doesn't care
 * which language a snapshot claims to be resolved into, so `makeOrder` defaults it to
 * `getDefaultLocale()` rather than making every caller state it.
 */
export type OrderLineInput = Omit<OrderItem, 'product' | 'locale'> & {
    product: OrderSnapshotInput;
    locale?: string;
};

/**
 * What a caller may pin, derived from the generated `Order`. The three totals and `status` are
 * dropped, not optional: they're required on the wire but never stored, so stating one would
 * invent a column the API never produced. `items` is replaced because a line here takes a
 * snapshot as DATA; see `OrderLineInput`.
 */
export type OrderOverrides = Omit<
    OverridesFor<Order>,
    'items' | 'status' | 'totalItems' | 'totalQuantity' | 'totalPrice'
> & {
    /** 24-char hex of the person who placed it. */
    userId?: Id;
    items?: OrderLineInput[];
};

/** An order ready for `orderRepository.create`. */
export type OrderFixture = Partial<OrderDocument> & { _id: OrderDocument['_id'] };

/** The contract's product id becomes Mongo's `_id`; its ISO dates become real `Date`s. */
const toSnapshot = ({
    id,
    title,
    price,
    createdAt,
    updatedAt,
    deletedAt,
    ...fields
}: OrderSnapshotInput): ProductSnapshot => ({
    _id: new Types.ObjectId(id),
    title,
    price,
    ...stripUndefined({
        ...fields,
        createdAt: toDate(createdAt),
        updatedAt: toDate(updatedAt),
        deletedAt: toDate(deletedAt)
    })
});

/**
 * Build an order ready for `orderRepository.create` from a caller's overrides.
 *
 * @param overrides - the fields to pin; see {@link OrderOverrides} for what may be stated
 * @returns the fixture, with an identity and defaults filled in for whatever was left unstated
 */
export const makeOrder = ({
    id,
    createdAt,
    updatedAt,
    userId,
    email,
    items,
    shippingMethod,
    shippingCost,
    shippingAddress,
    notes,
    deletedAt
}: OrderOverrides = {}): OrderFixture => ({
    ...identityOf({ id, createdAt, updatedAt }),
    userId: new Types.ObjectId(userId),
    email: email ?? 'test@example.com',
    items: (items ?? []).map(({ product, quantity, locale }) => ({
        product: toSnapshot(product),
        quantity,
        locale: locale ?? getDefaultLocale()
    })),
    /*
     * The three shipping columns pass through rather than defaulting to anything. All three are
     * optional on the wire and absent on an order placed before the checkout asked for them, so a
     * builder-supplied default would erase the difference between "not chosen" and "free" — which
     * is the distinction `pickup` (a real method, priced 0) exists to keep visible.
     *
     * `stripUndefined` is what makes "pass through" mean absent-stays-absent. `OrderOverrides`
     * derives from the contract's `Order`, so accepting a column and then not writing it
     * type-checks perfectly and leaves the dataset quietly missing whatever it described.
     */
    ...stripUndefined({
        shippingMethod,
        shippingCost,
        shippingAddress,
        notes,
        deletedAt: toDate(deletedAt)
    })
});
