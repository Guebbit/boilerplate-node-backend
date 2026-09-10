/**
 * @module
 * Order factories that touch the test database — `toOrderItem`, `makeOrder`, `createOrder`. The
 * builder in `../factories.ts` takes a product snapshot as data because seeds build orders from
 * catalogue rows that were never persisted; this wrapper converts a real document instead. An
 * order item embeds a full snapshot, not a reference, so repricing a product later can't rewrite
 * what a customer was charged.
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
} from '../factories';

/** Everything about an order a test may set beyond who placed it and what is in it. */
type OrderExtras = Omit<OrderOverrides, 'userId' | 'email' | 'items'>;

/**
 * Convert a persisted product document into an order line ready to embed.
 * Copies the whole document, minus Mongo's `_id`/`__v`, so a newly added column isn't silently
 * missed the way naming fields individually did. `toObject()` keeps `Date`s as `Date`s.
 *
 * @param locale - which locale the line claims its snapshot is resolved into; defaults (via
 *   `makeOrder`) to `getDefaultLocale()` when omitted, same as an untranslated order would freeze
 */
export const toOrderItem = (
    product: ProductDocument,
    quantity = 1,
    locale?: string
): OrderLineInput => {
    const { _id, __v, ...snapshot } = product.toObject();
    return { product: { ...snapshot, id: String(_id) }, quantity, locale };
};

/**
 * Build a valid order payload from a user and a list of order lines.
 * `extras` — shipping columns above all — passes through rather than defaulting, so a test can
 * tell "no method chosen" from "chose a free one"; a total that ignores shipping only shows on
 * an order that has some.
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
