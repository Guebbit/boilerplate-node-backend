/**
 * @module
 * How an order fixture is built.
 *
 * An order item embeds a product SNAPSHOT (`orderItemSchema` declares `product: productSchema`
 * with no `ref`), so this builder takes the snapshot as a value rather than an id to look up
 * later. It deliberately carries no `deletedAt` — a catalogue soft-delete says nothing about an
 * order already placed — and no totals, since those are derived at serialization time by
 * `applyOrderTransform` rather than stored.
 */

import { Types } from 'mongoose';
import {
    identityOf,
    compact,
    toDate,
    type OverridesFor
} from '@infrastructure/persistence/fixtures';
import type { ProductSnapshot } from '@modules/products';
import type { Id, Order, OrderItem, Product } from '@types';
import type { OrderDocument } from './model';

/**
 * The product as it was when the order was placed.
 *
 * The contract already says what that is: `OrderItem.product` is a `Product`, so this is the
 * generated `Product` with the three fields a snapshot must carry made required, rather than a
 * hand-written list of the six a seeder happens to copy.
 *
 * `createdAt` and `updatedAt` are the CATALOGUE row's, carried in rather than left to Mongoose.
 * `productSchema` declares `timestamps: true`, and a subdocument gets stamped on insert even when
 * the parent save passes `{ timestamps: false }` — that option does not reach nested schemas. Left
 * alone, every snapshot claimed the product was created at the instant the seeder ran, which is
 * both false and different on every run, so the exported dataset could never be byte-stable.
 */
export type OrderSnapshotInput = OverridesFor<Product> &
    Required<Pick<Product, 'id' | 'title' | 'price'>>;

/** One line of an order: the snapshot, and how many were bought. */
export type OrderLineInput = Omit<OrderItem, 'product'> & { product: OrderSnapshotInput };

/**
 * What a caller may pin, derived from the generated `Order`.
 *
 * The three totals and `status` are dropped rather than made optional: they are required on the
 * wire but never stored — `applyOrderTransform` derives them at serialization time — so a fixture
 * that could state one would be inventing a column, and `scripts/export-demo-dataset.ts` would publish the
 * invention as though the API had produced it. `items` is replaced because a line here takes a
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
    ...compact({
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
    items: (items ?? []).map(({ product, quantity }) => ({
        product: toSnapshot(product),
        quantity
    })),
    /*
     * The three shipping columns pass through rather than defaulting to anything. All three are
     * optional on the wire and absent on an order placed before the checkout asked for them, so a
     * builder-supplied default would erase the difference between "not chosen" and "free" — which
     * is the distinction `pickup` (a real method, priced 0) exists to keep visible.
     *
     * `compact` is what makes "pass through" mean absent-stays-absent. `OrderOverrides` derives
     * from the contract's `Order`, so accepting a column and then not writing it type-checks
     * perfectly and leaves the dataset quietly missing whatever it described.
     */
    ...compact({
        shippingMethod,
        shippingCost,
        shippingAddress,
        notes,
        deletedAt: toDate(deletedAt)
    })
});
