/**
 * @module
 * Order factories that touch the test database — `toOrderItem`, `makeOrder`, `createOrder`. The
 * builder in `../factories.ts` takes a product snapshot as data because seeds build orders from
 * catalogue rows that were never persisted; this wrapper converts a real document instead. An
 * order item embeds a full snapshot, not a reference, so repricing a product later can't rewrite
 * what a customer was charged.
 */

import type { OrderDocument } from '../model';
import type { UserDocument } from '@modules/users';
import type { ProductDocument } from '@modules/products';
import { orderRepository } from '../repository';
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

/**
 * The live repository object, for a sibling's `jest.spyOn` — a wrapper function copies the call,
 * not the binding, so it cannot intercept what this module's OWN code (`retractOrder`'s
 * compensation) reaches internally. Every other need below has a named, narrower helper instead;
 * reach for this one only when the assertion is "was this repository method called/failed", not
 * "what does the database now hold".
 */
export { orderRepository } from '../repository';

/** Insert an order into the test database and return the Mongoose document. */
export const createOrder = (
    user: UserDocument,
    items: OrderLineInput[],
    extras: OrderExtras = {}
): Promise<OrderDocument> => orderRepository.create(makeOrder(user, items, extras));

/** The raw stored document, hydrated — a sibling's own assertion on persisted state. */
export const readOrder = (id: string): Promise<OrderDocument | null> =>
    orderRepository.findById(id);

/** The first order matching a raw filter — a sibling's own assertion, never through the service. */
export const findOrder = (where: Record<string, unknown>): Promise<OrderDocument | null> =>
    orderRepository.findOne(where);

/** How many orders match a raw filter — a sibling's own assertion. */
export const countOrders = (where: Record<string, unknown> = {}): Promise<number> =>
    orderRepository.count(where);

/** Persist a document a sibling's fixture already built and mutated in memory. */
export const saveOrder = (document: OrderDocument): Promise<OrderDocument> =>
    orderRepository.save(document);

/**
 * Detach an account with an explicit retention deadline — `orderService.detachUserId` always
 * computes `NODE_ORDER_PII_RETENTION_DAYS` from now, which a sweep test needs to backdate to
 * exercise `anonymizeDueOrders` without waiting years.
 *
 * @param userId - the erased account's id
 * @param anonymizeAfter - when the reaper may scrub this order's remaining PII
 */
export const detachOrderUserId = (userId: string, anonymizeAfter: Date): Promise<number> =>
    orderRepository.detachUserId(userId, anonymizeAfter);
