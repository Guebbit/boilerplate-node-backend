/**
 * Order fixtures that touch the test database.
 *
 * The BUILDER lives one level up, in `src/modules/orders/fixtures.ts` — the same file the demo order
 * book is built from — and this file adapts it to what an integration test has in hand.
 *
 *   toOrderItem(product, qty?)  – a persisted product document → the line an order embeds.
 *   makeOrder(user, items)      – a plain payload, no database write.
 *   createOrder(user, items)    – inserts and returns the Mongoose document.
 *
 *   const user    = await createUser();
 *   const product = await createProduct({ price: 19.99 });
 *   const order   = await createOrder(user, [toOrderItem(product, 2)]);
 *
 * ## Why this one keeps its own signature
 *
 * `../fixtures`'s `makeOrder` takes a snapshot as DATA — `{ id, title, price, … }` — because the
 * seeds build orders from catalogue fixtures that were never persisted. A test has real documents,
 * so this wrapper takes them and does the conversion, rather than making every call site spell out
 * a snapshot it already holds.
 *
 * An order item embeds a full product SNAPSHOT, not a reference, so that repricing a product later
 * cannot rewrite what a customer was charged. That is why `toOrderItem` copies the document.
 */

import type { OrderDocument } from '@modules/orders';
import type { UserDocument } from '@modules/users';
import type { ProductDocument } from '@modules/products';
import { orderRepository } from '@modules/orders';
import {
    makeOrder as buildOrder,
    type OrderFixture,
    type OrderLineInput,
    type OrderOverrides
} from '../fixtures';

/** Everything about an order a test may set beyond who placed it and what is in it. */
type OrderExtras = Omit<OrderOverrides, 'userId' | 'email' | 'items'>;

/**
 * Convert a persisted product document into an order line ready to embed.
 *
 * The whole document goes in, minus the two keys that belong to Mongo rather than to the product.
 * It used to name eight fields explicitly, which made this a third place — after `openapi.yaml` and
 * the schema — that had an opinion about what a Product is, and the one most likely to quietly stop
 * copying a newly added column. `toObject()` keeps `Date`s as `Date`s, which is what the embedded
 * subdocument stores; `toJSON()` would hand over ISO strings.
 */
export const toOrderItem = (product: ProductDocument, quantity = 1): OrderLineInput => {
    const { _id, __v, ...snapshot } = product.toObject();
    return { product: { ...snapshot, id: String(_id) }, quantity };
};

/**
 * Build a valid order payload from a user and a list of order lines.
 *
 * `extras` is what an order carries beyond its lines — the shipping columns above all, which the
 * builder passes through rather than defaulting so that a test can tell "no method chosen" from
 * "chose a free one". A total that ignores shipping is only visible on an order that has some.
 */
export const makeOrder = (
    user: UserDocument,
    items: OrderLineInput[],
    extras: OrderExtras = {}
): OrderFixture =>
    buildOrder({
        userId: String(user._id),
        email: user.email,
        items,
        ...extras
    });

/** Insert an order into the test database and return the Mongoose document. */
export const createOrder = (
    user: UserDocument,
    items: OrderLineInput[],
    extras: OrderExtras = {}
): Promise<OrderDocument> => orderRepository.create(makeOrder(user, items, extras));
