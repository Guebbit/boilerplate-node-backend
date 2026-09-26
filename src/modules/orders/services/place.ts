/**
 * @module
 * The one function that writes a new order — `crud.ts`'s admin `create` and `@modules/cart`'s
 * checkout both funnel through it, so the write itself exists in exactly one place.
 *
 * Order:     freeze the lines, hold the stock, allocate the invoice number, write the row. The
 *            hold comes BEFORE the write, so a refused hold burns neither a row nor a number.
 * Verdict:   `PlaceOrderOutcome` is a plain verdict, not an HTTP envelope — `create` and checkout
 *            map it to their own wire shapes (`ORDER_INSUFFICIENT_STOCK` vs
 *            `CART_INSUFFICIENT_STOCK`), the same way `checkOrderLines` never opines either.
 * Scope:     payment-method validation, the open-transfer cap, resolving a shipping
 *            address/method, cart pre-flight and clearing all stay with the caller.
 * Reference: the bank-transfer reference is minted here, not fetched from `payments` — it names a
 *            row on THIS collection, so a retried place can't mint a second one for the order.
 */

import { Types } from 'mongoose';
import type { ProductSnapshot } from '@modules/products';
import { logger } from '@infrastructure/adapters/logger';
import { inventoryService, type StockShortfall } from '@modules/inventory';
import { emitDomainEvent } from '@kernel/events';
import type { OrderDocument, OrderDocumentItem } from '../model';
import { checkOrderLines } from '../domain/rules';
import { buildReference } from '../domain/transfer-reference';
import { freezeOrderLines } from './snapshot';
import { allocateInvoiceNumber } from './invoice-numbering';
import { orderRepository } from '../repository';
import { ORDER_CREATED } from '../events';
// `userId` is stored as an ObjectId, so writes have to coerce it — same rule `crud.ts`'s `create`
// follows for its own writes.
import { toObjectId } from '@infrastructure/persistence/create-repository';

/**
 * One line ready to be written: the request's own `{productId, quantity}` plus its resolved
 * product — `null`/`undefined` both mean "the reference no longer resolves," matching
 * `checkOrderLines`' own tolerance for either.
 */
export interface PlaceOrderLine {
    item: { productId: string; quantity: number };
    product: ProductSnapshot | null | undefined;
}

/**
 * The shipping half of an order, already resolved by the caller — `placeOrder` asks no questions
 * about which method was offered or whether it applies to this basket, only how to price it.
 *
 * `priceFor` takes the FROZEN lines rather than a precomputed number: the free-above-a-threshold
 * rule prices the basket actually being bought, which is only settled once `placeOrder` has frozen
 * it — pricing off the pre-freeze lines would price a basket that could still theoretically change
 * shape between the caller's own read and this function's write.
 */
export interface PlaceOrderShipping {
    address?: {
        fullName: string;
        street: string;
        city: string;
        zip: string;
        country: string;
        phone?: string;
    };
    method?: { id: string; priceFor: (frozenLines: readonly OrderDocumentItem[]) => number };
    /** Stock hold length in minutes; `undefined` defers to `reserveForOrder`'s own default. */
    holdMinutes?: number;
}

/** What `placeOrder` needs to write one order and hold its stock. */
export interface PlaceOrderInput {
    userId: string;
    email: string;
    locale: string;
    lines: readonly PlaceOrderLine[];
    /** `undefined` behaves exactly like `'card'` — no reference is minted, no hold-length override. */
    paymentMethod?: string;
    /** When a `bank_transfer` order's hold should expire — the email needs this alongside the order. */
    payBy?: Date;
    shipping?: PlaceOrderShipping;
    /** Free-text notes the buyer left at checkout — `undefined` writes no `notes` field at all. */
    notes?: string;
}

/** The verdict `placeOrder` returns — a plain outcome, not an HTTP envelope; see this file's docblock. */
export type PlaceOrderOutcome =
    | { ok: true; order: OrderDocument }
    | { ok: false; reason: 'no-lines' }
    | { ok: false; reason: 'product-missing' }
    | { ok: false; reason: 'insufficient-stock'; shortfalls: StockShortfall[] };

/**
 * Write a new order: freeze the lines, hold the stock, allocate the invoice number, then write the
 * row. Never rejects on a refusal — `checkOrderLines`/the stock hold answer through the returned
 * verdict, the same convention `checkOrderLines` itself already uses.
 *
 * Hold BEFORE write, deliberately: the id is generated up front and `reserveForOrder` only
 * ever needs it, so a refused hold writes nothing at all — no order to roll back, no invoice
 * number burned on a sale that never happened. A hold taken and then lost to a failed write is the
 * one case this still has to unwind by hand; a genuine crash between the two leaves only a hold,
 * which expires through the reservation sweep like any other abandoned checkout.
 *
 * @param input - everything the write needs; see {@link PlaceOrderInput}
 * @returns the written order, or the specific reason nothing was written
 */
export const placeOrder = async (input: PlaceOrderInput): Promise<PlaceOrderOutcome> => {
    const verdict = checkOrderLines(
        input.lines.map(({ item, product }) => ({ quantity: item.quantity, product }))
    );
    if (!verdict.ok) return { ok: false, reason: verdict.reason };

    const orderItems = await freezeOrderLines(
        input.locale,
        // `checkOrderLines` above already refused a missing product; every entry is defined here.
        input.lines.map(({ product }) => product!),
        input.lines.map(({ item }) => item.quantity)
    );

    /*
     * Pre-generated so `reserveForOrder` and a `bank_transfer` order's reference can both use the
     * SAME id the write below will eventually create — reserving needs no row to exist yet, and
     * the reference must name the row it will end up on, not a second id nobody else ever sees.
     */
    const orderId = new Types.ObjectId();
    const transferReference =
        input.paymentMethod === 'bank_transfer' ? buildReference(orderId.toHexString()) : undefined;

    /*
     * The units are not SOLD here. They stay on the shelf until the payment lands or the hold
     * ends, so an unpaid order no longer removes stock from the world — same reserve/rollback
     * shape `crud.ts`'s `create` and `cart`'s checkout each ran on their own before this function
     * absorbed both.
     */
    const outcome = await inventoryService.reserveForOrder(
        orderId.toHexString(),
        input.lines.map(({ item }) => ({ productId: item.productId, quantity: item.quantity })),
        input.shipping?.holdMinutes
    );
    if (!outcome.held)
        return { ok: false, reason: 'insufficient-stock', shortfalls: outcome.shortfalls };

    // eslint-disable-next-line no-restricted-syntax -- multi-step write with partial rollback: the hold is already taken by this point, so a failed invoice allocation or order write must give it back rather than leave it standing on a row that was never created
    try {
        // Only spent once the hold is secured — a refused reserve above returns before this ever
        // runs. Allocated INSIDE this try, not before it, so a throw here still releases the hold
        // instead of leaving it standing with no order and no number spent on it.
        const invoiceNumber = await allocateInvoiceNumber();

        const order = await orderRepository.create({
            _id: orderId,
            userId: toObjectId(input.userId),
            email: input.email,
            items: orderItems,
            invoiceNumber,
            ...(input.notes ? { notes: input.notes } : {}),
            ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
            ...(input.payBy ? { payBy: input.payBy } : {}),
            ...(transferReference ? { transferReference } : {}),
            ...(input.shipping?.address ? { shippingAddress: input.shipping.address } : {}),
            // Priced off THESE frozen lines' total — the free-above rule prices the basket being
            // bought, not a later edit of it. See `PlaceOrderShipping.priceFor`'s own docblock.
            ...(input.shipping?.method
                ? {
                      shippingMethod: input.shipping.method.id,
                      shippingCost: input.shipping.method.priceFor(orderItems)
                  }
                : {})
            // The conditional spreads above widen to a plain index signature, which `create`'s
            // typed input cannot narrow back on its own; every field it can carry is optional or
            // spread in.
        } as Partial<OrderDocument>);

        // Emitted here rather than left to `recordCreated`: this is the one function that writes a
        // new order, so a future caller of it cannot forget to announce one the way a caller of
        // `recordCreated` could — `webhooks` needs this fact regardless of which door placed the
        // order. Fire-and-forget, like `recordCreated`'s other
        // emits: a slow or failing listener must not delay the response this function's callers are
        // already sending.
        void emitDomainEvent(ORDER_CREATED, { orderId: String(order._id) });

        return { ok: true, order };
    } catch (error) {
        await inventoryService
            .releaseForOrder(orderId.toHexString())
            .catch((releaseError: unknown) => {
                // Stryker disable all
                logger.error({
                    message: `Orders: could not release the hold for order ${orderId.toHexString()} after its write failed — left for the reservation sweep`,
                    error: releaseError
                });
                // Stryker restore all
            });
        throw error;
    }
};
