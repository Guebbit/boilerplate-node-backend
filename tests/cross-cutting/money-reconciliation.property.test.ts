/**
 * @module
 * Cross-cutting property — the composition of `orders.orderTotal` and `delivery.priceShipping`
 * that cart's checkout, the payment intent freeze, and the confirmation email each perform
 * themselves rather than call one another for. `totals.property.test.ts` and
 * `money.property.test.ts` prove `orders`' own functions in isolation; neither proves the
 * composition every caller of both modules relies on agreeing with. See DETERMINISTIC_TOOLS.md,
 * "money invariants as one shared property". Seeded, so a counterexample reproduces.
 */
import fc from 'fast-check';
import { sumLineItems, orderTotal } from '@modules/orders';
import { findShippingMethod, priceShipping } from '@modules/delivery';

/** One seed for the file, and one place to change it. */
const RUN = { seed: 20_260_902, numRuns: 300, endOnFailure: true } as const;

const lineItem = () =>
    fc.record({
        quantity: fc.integer({ min: 0, max: 1000 }),
        product: fc.record({ price: fc.integer({ min: 0, max: 100_000 }) })
    });

/** One of the three methods this shop offers — `findShippingMethod` is the only public way to reach one. */
const shippingMethod = () =>
    fc.constantFrom('standard', 'express', 'pickup').map((id) => findShippingMethod(id)!);

describe('order total + shipping — reconciliation', () => {
    it('never invents or drops a cent composing lines and shipping', () => {
        fc.assert(
            fc.property(
                fc.array(lineItem(), { maxLength: 20 }),
                shippingMethod(),
                (items, method) => {
                    const linesTotal = sumLineItems(items).price;
                    const shippingCost = priceShipping(method, linesTotal);
                    const total = orderTotal({ items, shippingCost });

                    expect(Math.round(total * 100)).toBe(
                        Math.round(linesTotal * 100) + Math.round(shippingCost * 100)
                    );
                }
            ),
            RUN
        );
    });

    it('charges exactly the lines total once a method waives shipping', () => {
        // `pickup` has no threshold and a zero rate — the one method always free, so the total
        // must equal the lines alone with nothing left over from the composition.
        fc.assert(
            fc.property(fc.array(lineItem(), { maxLength: 20 }), (items) => {
                const linesTotal = sumLineItems(items).price;
                const pickup = findShippingMethod('pickup')!;

                expect(orderTotal({ items, shippingCost: priceShipping(pickup, linesTotal) })).toBe(
                    linesTotal
                );
            }),
            RUN
        );
    });
});
