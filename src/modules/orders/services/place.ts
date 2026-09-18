/**
 * @module
 * The one function that writes a new order — the aggregate `crud.ts`'s admin `create` and
 * `@modules/cart`'s checkout both funnel through, so the write itself (freeze the lines, allocate
 * the invoice number, mint a `bank_transfer` reference, hold the stock) exists in exactly one
 * place. Everything caller-specific — payment-method validation, the open-transfer cap, resolving
 * a shipping address/method, cart pre-flight and clearing — stays with the caller; this function
 * only takes what it needs to write the row and hold the stock.
 *
 * `PlaceOrderOutcome` is a plain verdict, not an HTTP envelope: `create` and checkout map it to
 * their own wire shapes, which differ (`ORDER_INSUFFICIENT_STOCK` vs `CART_INSUFFICIENT_STOCK`) —
 * this function has no opinion on that, the same way `checkOrderLines` never did.
 *
 * The bank-transfer reference is minted here rather than fetched from `payments`: it names a row
 * on THIS collection, so minting it as part of the same write is what makes a retried place unable
 * to mint a second one for the same order.
 */

import { Types } from 'mongoose';
import type { ProductSnapshot } from '@modules/products';
import { inventoryService, type StockShortfall } from '@modules/inventory';
import type { OrderDocument, OrderDocumentItem } from '../model';
import { checkOrderLines } from '../domain/rules';
import { buildReference } from '../domain/transfer-reference';
import { freezeOrderLines } from './snapshot';
import { allocateInvoiceNumber } from './invoice-numbering';
import { retractOrder } from './retract';
import { orderRepository } from '../repository';
// `userId` is stored as an ObjectId, so writes have to coerce it — same rule `crud.ts`'s `create`
// already followed before this function absorbed its write.
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
}

/** The verdict `placeOrder` returns — a plain outcome, not an HTTP envelope; see this file's docblock. */
export type PlaceOrderOutcome =
    | { ok: true; order: OrderDocument }
    | { ok: false; reason: 'no-lines' }
    | { ok: false; reason: 'product-missing' }
    | { ok: false; reason: 'insufficient-stock'; shortfalls: StockShortfall[] };

/**
 * Write a new order: freeze the lines, allocate the invoice number, mint a `bank_transfer`
 * reference when the payment method calls for one, hold the stock, and roll the order back if the
 * hold cannot be taken. Never rejects on a refusal — `checkOrderLines`/the stock hold answer
 * through the returned verdict, the same convention `checkOrderLines` itself already uses.
 *
 * @param input - everything the write needs; see {@link PlaceOrderInput}
 * @returns the written order, or the specific reason nothing was written
 */
export const placeOrder = async (input: PlaceOrderInput): Promise<PlaceOrderOutcome> => {
    const verdict = checkOrderLines(
        input.lines.map(({ item, product }) => ({ quantity: item.quantity, product }))
    );
    if (!verdict.ok) return { ok: false, reason: verdict.reason };

    const [orderItems, invoiceNumber] = await Promise.all([
        freezeOrderLines(
            input.locale,
            // `checkOrderLines` above already refused a missing product; every entry is defined here.
            input.lines.map(({ product }) => product!),
            input.lines.map(({ item }) => item.quantity)
        ),
        allocateInvoiceNumber()
    ]);

    /*
     * Pre-generated so a `bank_transfer` order's reference can be minted from the SAME id the
     * write below is about to create — the reference must name the row it will end up on, not a
     * second id nobody else ever sees.
     */
    const orderId = new Types.ObjectId();
    const transferReference =
        input.paymentMethod === 'bank_transfer' ? buildReference(orderId.toHexString()) : undefined;

    const order = await orderRepository.create({
        _id: orderId,
        userId: toObjectId(input.userId),
        email: input.email,
        items: orderItems,
        invoiceNumber,
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
    } as Partial<OrderDocument>);

    /*
     * The units are not SOLD here. They stay on the shelf until the payment lands or the hold
     * ends, so an unpaid order no longer removes stock from the world — same reserve/rollback
     * shape `crud.ts`'s `create` and `cart`'s checkout each ran on their own before this function
     * absorbed both.
     */
    const outcome = await inventoryService.reserveForOrder(
        String(order._id),
        input.lines.map(({ item }) => ({ productId: item.productId, quantity: item.quantity })),
        input.shipping?.holdMinutes
    );
    if (!outcome.held) {
        await retractOrder(order, false);
        return { ok: false, reason: 'insufficient-stock', shortfalls: outcome.shortfalls };
    }

    return { ok: true, order };
};
