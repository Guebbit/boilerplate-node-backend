/**
 * @module
 * One basket, three prices, one number: what the cart shows (`GET /cart`), what the order is
 * written for (`POST /cart/checkout`) and what the payment intent asks the provider to take
 * (`POST /payments/intent`) must be the SAME amount, to the last minor unit.
 *
 * `tests/cross-cutting/money-reconciliation.property.test.ts` proves the pure composition; this
 * drives the three real doors, which is where a number is assembled a second time. The expected
 * amount is computed here in integer minor units (per-unit rounding, the rule `money.ts`
 * documents), never by calling the code under test.
 *
 * Covers the edges the pure suites cannot see through HTTP: a price that is not whole cents, a
 * basket that crosses the free-shipping line, and a currency whose minor unit is not a hundredth.
 */

import fc from 'fast-check';
import { api, authenticateAs } from '@tests/http';
import { checkoutAs } from '@tests/checkout-as';
import { setupTestDb } from '@tests/setup-test-db';
import { withEnvironment } from '@tests/environment';
import { PROPERTY_RUNS_WITH_DATABASE } from '@tests/knobs';
import { giveAddress } from '@modules/addresses/tests/factories';
import { createProduct } from '@modules/products/tests/factories';

setupTestDb();

/** One seed for the file; the count is `TEST_PROPERTY_RUNS_DB`. */
const RUN = { seed: 20_261_005, numRuns: PROPERTY_RUNS_WITH_DATABASE, endOnFailure: true } as const;

/** One basket line: a catalogue price (any decimal) and a quantity. */
interface BasketLine {
    price: number;
    quantity: number;
}

/** The shipping methods the shop offers, with the rule each prices by (`delivery/domain/rates.ts`). */
const SHIPPING = {
    standard: { flat: 5, freeAbove: 100 },
    express: { flat: 15, freeAbove: Infinity },
    pickup: { flat: 0, freeAbove: Infinity }
} as const;

/** What one basket produced at each of the three doors, as the wire carries it. */
interface Prices {
    /** `GET /cart`'s `summary`. */
    cart: { itemsTotal: number; shippingCost: number; totalPrice: number };
    /** The order's `totalPrice`. */
    order: number;
    /** The payment intent's `amount`. */
    intent: number;
}

/** A logged-in shopper with an address, from `authenticateAs` and `giveAddress`. */
type Shopper = Awaited<ReturnType<typeof authenticateAs>>;

/** A fresh shopper who can check out to an address. */
const newShopper = async (): Promise<Shopper> => {
    const shopper = await authenticateAs();
    await giveAddress(shopper.user.id);
    return shopper;
};

/**
 * What the basket should cost, in integer minor units, computed independently of the code under
 * test: each unit rounded to a minor unit, times its quantity, plus shipping priced on the lines'
 * decimal total.
 *
 * @param lines - the basket
 * @param method - which shipping method is chosen
 * @param exponent - the currency's decimal places (2 for EUR, 0 for JPY)
 */
const expectedMinor = (
    lines: readonly BasketLine[],
    method: keyof typeof SHIPPING,
    exponent: number
): number => {
    const scale = 10 ** exponent;
    const linesMinor = lines.reduce(
        (sum, { price, quantity }) => sum + Math.round(price * scale) * quantity,
        0
    );
    const { flat, freeAbove } = SHIPPING[method];
    const shipping = linesMinor / scale >= freeAbove ? 0 : flat;
    return linesMinor + shipping * scale;
};

/** Run one basket through the cart view, checkout and the payment intent as `shopper`. */
const priceThroughHttp = async (
    { bearer }: Shopper,
    lines: readonly BasketLine[],
    method: keyof typeof SHIPPING
): Promise<Prices> => {
    for (const { price, quantity } of lines) {
        const product = await createProduct({ price, onHand: quantity + 5 });
        await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), quantity })
            .expect(201);
    }
    await api()
        .put('/cart/shipping-method')
        .set('Authorization', bearer)
        .send({ shippingMethodId: method })
        .expect(200);

    const cart = await api().get('/cart').set('Authorization', bearer).expect(200);
    const checkout = await checkoutAs(bearer);
    expect(checkout.status).toBe(201);
    const intent = await api()
        .post('/payments/intent')
        .set('Authorization', bearer)
        .send({ orderId: checkout.body.data.id })
        .expect(201);
    // Each basket leaves an unpaid order, and a shopper may hold only so many open at once
    // (`CART_OPEN_ORDER_LIMIT`): cancel it so the next basket can be placed by the same shopper.
    await api()
        .post(`/orders/${String(checkout.body.data.id)}/cancel`)
        .set('Authorization', bearer)
        .expect(200);

    return {
        cart: cart.body.data.summary,
        order: checkout.body.data.totalPrice,
        intent: intent.body.data.amount
    };
};

/** One named basket the table below drives. */
interface Case {
    name: string;
    lines: BasketLine[];
    method: keyof typeof SHIPPING;
}

/**
 * What each door should answer, from the independent oracle above — and the cart's own parts, so
 * a wrong `totalPrice` cannot hide behind a right one.
 */
const expectedPrices = (
    lines: readonly BasketLine[],
    method: keyof typeof SHIPPING,
    exponent: number
) => {
    const scale = 10 ** exponent;
    const total = expectedMinor(lines, method, exponent) / scale;
    const shippingMinor =
        expectedMinor(lines, method, exponent) - expectedMinor(lines, 'pickup', exponent);
    return {
        total,
        itemsTotal: expectedMinor(lines, 'pickup', exponent) / scale,
        shipping: shippingMinor / scale
    };
};

/** The assertions every door must satisfy, shared by the table and the property. */
const expectReconciled = (prices: Prices, expected: ReturnType<typeof expectedPrices>): void => {
    expect(prices.order).toBe(expected.total);
    expect(prices.intent).toBe(expected.total);
    expect(prices.cart.itemsTotal).toBe(expected.itemsTotal);
    expect(prices.cart.shippingCost).toBe(expected.shipping);
};

const EUR_CASES: readonly Case[] = [
    {
        name: 'a price whose float sum with shipping drifts',
        lines: [{ price: 0.56, quantity: 1 }],
        method: 'standard'
    },
    { name: 'tenths added up', lines: [{ price: 0.1, quantity: 3 }], method: 'standard' },
    {
        name: 'a price just under the free-shipping line',
        lines: [{ price: 33.33, quantity: 3 }],
        method: 'standard'
    },
    {
        name: 'a basket exactly on the free-shipping line',
        lines: [{ price: 50, quantity: 2 }],
        method: 'standard'
    },
    {
        name: 'express on an odd-cent basket',
        lines: [
            { price: 19.99, quantity: 3 },
            { price: 0.07, quantity: 9 }
        ],
        method: 'express'
    },
    {
        name: 'a price with a fraction of a cent',
        lines: [{ price: 0.005, quantity: 3 }],
        method: 'pickup'
    },
    {
        name: 'a price with a fraction of a cent, shipped',
        lines: [{ price: 12.345, quantity: 2 }],
        method: 'standard'
    },
    { name: 'a free item', lines: [{ price: 0, quantity: 4 }], method: 'standard' }
];

describe('cart view, order and payment intent agree on the amount (EUR)', () => {
    it.each(EUR_CASES)('$name', async ({ lines, method }) => {
        const prices = await priceThroughHttp(await newShopper(), lines, method);

        expectReconciled(prices, expectedPrices(lines, method, 2));
    });

    it('agrees for any generated basket', async () => {
        const shopper = await newShopper();
        await fc.assert(
            fc.asyncProperty(
                fc.array(
                    fc.record({
                        // Whole cents and sub-cent prices both: the catalogue accepts any decimal.
                        price: fc.oneof(
                            fc.integer({ min: 0, max: 30_000 }).map((cents) => cents / 100),
                            fc.integer({ min: 0, max: 3_000_000 }).map((tenths) => tenths / 1000)
                        ),
                        quantity: fc.integer({ min: 1, max: 6 })
                    }),
                    { minLength: 1, maxLength: 3 }
                ),
                fc.constantFrom('standard', 'express', 'pickup'),
                async (lines, method) => {
                    const prices = await priceThroughHttp(shopper, lines, method);

                    expectReconciled(prices, expectedPrices(lines, method, 2));
                }
            ),
            RUN
        );
    });
});

describe('cart view, order and payment intent agree on the amount (JPY, no minor unit)', () => {
    it('prices a whole-yen basket identically in all three', () =>
        withEnvironment('NODE_DEFAULT_CURRENCY', 'JPY', async () => {
            const lines = [
                { price: 1250, quantity: 2 },
                { price: 399, quantity: 1 }
            ];

            const prices = await priceThroughHttp(await newShopper(), lines, 'standard');

            // Shipping is 5 units of the shop's currency; nothing may be scaled by 100.
            expectReconciled(prices, expectedPrices(lines, 'standard', 0));
        }));

    it('rounds a fractional yen per unit, the same way in all three', () =>
        withEnvironment('NODE_DEFAULT_CURRENCY', 'JPY', async () => {
            const lines = [{ price: 99.5, quantity: 3 }];

            const prices = await priceThroughHttp(await newShopper(), lines, 'pickup');

            expectReconciled(prices, expectedPrices(lines, 'pickup', 0));
        }));
});
