/**
 * @module
 * The cart projection — how a stored cart becomes something a caller can read.
 *
 * Internal to `services/`: `checkout.ts` and `items.ts` share these helpers; neither owns them.
 *
 * A cart is its own document keyed by `userId` (`../model`), so every operation is one addressed
 * write or read. Absence and emptiness are the same state: no cart document answers as an empty
 * cart, never a 404.
 */

import { NO_MONEY, toDecimalString } from '@domain-primitives/money';
import { orderTotal, sumLineItems } from '@modules/orders';
import { inventoryService, type LiveAvailability } from '@modules/inventory';
import { isBackorder, productService } from '@modules/products';
import type { ProductDocument } from '@modules/products';
import type { Lean } from '@infrastructure/persistence/create-repository';
import type { CartItem, CartShipping, CartWarning } from '@types';
import {
    SHIPPING_METHODS,
    methodFitsWeight,
    priceShipping,
    type StaticShippingMethod
} from '@modules/delivery';
import type { CartDocument } from '../model';
import { basketWeight, fitsStock, needsShipping, unitsShippingLater } from '../domain';
import { presentCart, type CartView, type JudgedCartLine } from '../presenter';
import { cartLineMax } from '../config';
import { shopCurrency } from '@modules/shop';

/**
 * A cart line joined with the product it references.
 * `productId` and `product` are separate fields on purpose: {@link readCartLines} joins by a
 * separate `productService.findManyByIds` lookup rather than a Mongoose `populate()` — cart
 * reaches products through its service, not its collection —
 * so the id it looked the product up by is kept alongside the result rather than overwritten.
 *
 * @see docs/understand/strategic-ddd.md#_5-published-language-—-the-barrel
 */
export interface CartLine extends CartItem {
    /** The joined product, or `null` for an id that resolves to nothing. */
    product: Lean<ProductDocument> | null;
}

/** A cart line whose reference resolved — what an order may be built from. */
export type JoinedCartLine = CartLine & { product: Lean<ProductDocument> };

/** Narrow a line to one whose product actually exists. */
export const isJoined = (line: CartLine): line is JoinedCartLine => line.product !== null;

/**
 * Join a cart's lines to their products, in one query.
 *
 * `productService.findManyByIds` is unscoped: a
 * soft-deleted or hidden product still joins, `active`/`deletedAt` included, which is what
 * lets checkout tell "gone" (hard-deleted, absent from the lookup) from "here, but not sellable"
 * apart. One `$in` query for however many lines the cart holds, same shape as
 * `orders/services/current.ts`'s own catalogue join.
 */
export const readCartLines = (cart: CartDocument | null): Promise<CartLine[]> => {
    if (!cart) return Promise.resolve([]);

    // No `items = []` fallback: the schema defaults the array, so a hydrated cart always has one.
    const productIds = cart.items.map(({ productId }) => productId.toString());

    return productService.findManyByIds(productIds).then((products) => {
        const byId = new Map(products.map((product) => [String(product._id), product]));

        return cart.items.map(({ productId, quantity }) => ({
            productId: productId.toString(),
            quantity,
            product: byId.get(productId.toString()) ?? null
        }));
    });
};

/**
 * What a shipping method costs this basket: the flat rate, or nothing once the basket's whole
 * items total reaches the method's `freeAbove`. Every line counts, digital ones included (the
 * Shopify and WooCommerce rule), and the cart's quote and checkout's charge both come from here so
 * they cannot disagree.
 *
 * @param method - the method being priced
 * @param lines - the basket's lines, cart lines or an order's frozen ones
 * @param currency - the ISO-4217 code the lines are priced in
 */
export const shippingPriceFor = (
    method: StaticShippingMethod,
    lines: Parameters<typeof sumLineItems>[0],
    currency: string
): string => priceShipping(method, sumLineItems(lines, currency).price, currency);

/**
 * What this basket needs from shipping, and every method that currently fits it, each priced
 * through {@link shippingPriceFor} — so this list and what checkout would charge can never
 * disagree. Empty options for a basket that needs no shipping at all: `CART_SHIPPING_NOT_APPLICABLE`
 * is what `cartShippingMethodSet` refuses a choice with in that case, so nothing here would ever be
 * a legal pick.
 * @param joined - the basket's lines, already narrowed to ones whose product resolved
 * @returns the fitting, priced options, and whether choosing one is required at all
 */
export const shippingOptionsFor = (
    joined: JoinedCartLine[]
): Pick<CartShipping, 'required' | 'options'> => {
    if (!needsShipping(joined)) return { required: false, options: [] };

    const weight = basketWeight(joined);
    const currency = shopCurrency();
    const options = SHIPPING_METHODS.filter((method) => methodFitsWeight(method, weight)).map(
        (method) => ({
            id: method.id,
            price: shippingPriceFor(method, joined, currency),
            requiresAddress: method.requiresAddress,
            tracked: method.tracked
        })
    );
    return { required: true, options };
};

/**
 * The method a cart's stored choice actually stands for. A choice that is not among the basket's
 * fitting options counts as none: the basket may have gone digital-only, lost its last physical
 * line or outgrown the method since it was set. The one rule the cart's view and checkout share.
 *
 * @param stored - the id stored on the cart, if any
 * @param options - the basket's fitting options, from {@link shippingOptionsFor}
 * @returns the stored id when it still fits, otherwise `undefined` (none)
 */
export const effectiveShippingChoice = (
    stored: string | undefined,
    options: CartShipping['options']
): string | undefined =>
    stored !== undefined && options.some((option) => option.id === stored) ? stored : undefined;

/**
 * What a hard-deleted or never-judged product reads: nothing to buy. The cart line is kept, so the
 * client can show it and let the shopper remove it.
 */
const NOT_FOR_SALE: LiveAvailability = {
    availability: 'out_of_stock',
    quantityAvailable: 0,
    shelf: 0
};

/**
 * One line with the product's own stock answer, and whether checkout would take it as it stands.
 * The words and numbers are inventory's (`GET /products/{id}/availability`); only
 * `quantityBackordered` and `buyable` are this module's.
 *
 * @param line - the stored line joined to its product
 * @param stock - the product's live availability; absent for a hard-deleted product
 */
const judgeLine = (line: CartLine, stock: LiveAvailability | undefined): JudgedCartLine => {
    const { availability, availabilityDate, quantityAvailable, shelf } = stock ?? NOT_FOR_SALE;
    // Nothing ships later on a line that cannot be bought at all.
    const quantityBackordered =
        availability === 'out_of_stock'
            ? undefined
            : unitsShippingLater({
                  preorder: availability === 'preorder',
                  backorder: line.product !== null && isBackorder(line.product, new Date()),
                  shelf,
                  quantity: line.quantity
              });
    return {
        productId: line.productId,
        quantity: line.quantity,
        availability,
        ...(availabilityDate === undefined ? {} : { availabilityDate }),
        ...(quantityAvailable === undefined ? {} : { quantityAvailable }),
        ...(quantityBackordered === undefined ? {} : { quantityBackordered }),
        // Hidden, deleted and off-sale products all read `out_of_stock`, so one test covers them.
        buyable:
            availability !== 'out_of_stock' &&
            (quantityAvailable === undefined || fitsStock(line.quantity, quantityAvailable))
    };
};

/** Assemble the view from lines already joined and the products' availability, with no further read. */
const buildView = (
    cart: CartDocument | null,
    lines: CartLine[],
    stock: Map<string, LiveAvailability>,
    warnings: readonly CartWarning[] | undefined
): CartView => {
    /**
     * A cart never freezes a currency of its own — it hasn't checked out — so it always
     * prices against the shop's CURRENT setting, unlike an order's own frozen `currency`.
     */
    const currency = shopCurrency();
    const { count, quantity, price } = sumLineItems(lines, currency);
    const joined = lines.filter((line) => isJoined(line));
    const { required, options } = shippingOptionsFor(joined);
    const selected = effectiveShippingChoice(cart?.shippingMethodId, options);
    const shippingCost =
        options.find((option) => option.id === selected)?.price ??
        toDecimalString(NO_MONEY, currency);
    return presentCart({
        lines: lines.map((line) => judgeLine(line, stock.get(line.productId))),
        count,
        quantity,
        itemsTotal: price,
        shippingCost,
        /**
         * The order and the payment intent total in minor units; adding the two decimals here
         * would show 5.5600000000000005 for a basket that is charged 5.56.
         */
        totalPrice: orderTotal({ items: lines, shippingCost, currency }),
        currency,
        shipping: { required, ...(selected === undefined ? {} : { selected }), options },
        lineMax: cartLineMax(),
        warnings
    });
};

/**
 * Turn a cart document into the response the contract declares.
 * The joined product prices the cart and, with inventory's live availability, sets each line's
 * stock answer, then is dropped: `CartResponseItem` in `openapi.yaml` is `additionalProperties:
 * false`. The ledger is read once for the whole cart, uncached, so a line never shows a number a
 * stock move has already changed. Use `cartGet` where the joined product is actually needed.
 *
 * @param cart - the stored cart, or `null` for none
 * @param warnings - what the write that produced this view clamped; absent for a read
 */
export const toCartView = (
    cart: CartDocument | null,
    warnings?: readonly CartWarning[]
): Promise<CartView> =>
    readCartLines(cart).then((lines) =>
        inventoryService
            .liveAvailabilityOf(lines.map(({ productId }) => productId))
            .then((stock) => buildView(cart, lines, stock, warnings))
    );
