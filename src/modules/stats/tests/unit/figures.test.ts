/**
 * The sales formulas on a fixed table. The subject is that net sales takes the reversals off, that
 * shipping and VAT are charged-minus-refunded, and that nothing is divided by zero orders.
 */
import { toMinorUnits } from '@shared-kernel/money';
import { addRawFigures, emptyRawFigures, figuresOf, rateOf } from '../../services/figures';

/** Minor units of a EUR amount. */
const eur = (amount: number) => toMinorUnits(amount, 'EUR');

describe('figuresOf', () => {
    // Two orders: 100.00 + 40.00 goods net, 10.00 + 0.00 shipping net, VAT 24.20 + 8.80, and one
    // credit note that gives back 40.00 goods net, 8.80 VAT (48.80 gross).
    const raw = {
        ...emptyRawFigures(),
        orders: 2,
        unitsOrdered: 5,
        unitsReversed: 1,
        invoicedGoods: eur(140),
        invoicedShipping: eur(10),
        invoicedTax: eur(33),
        invoicedGross: eur(183),
        creditedGoods: eur(40),
        creditedTax: eur(8.8),
        creditedGross: eur(48.8)
    };

    it('takes reversals off the goods, and charged minus refunded off shipping and VAT', () => {
        expect(figuresOf(raw, 'EUR')).toEqual({
            orders: 2,
            unitsOrdered: 5,
            unitsReversed: 1,
            netUnits: 4,
            grossSales: 140,
            discounts: 0,
            reversals: 40,
            netSales: 100,
            shipping: 10,
            taxes: 24.2,
            totalSales: 134.2,
            refunds: 48.8,
            averageOrderValue: 70
        });
    });

    it('reads a shop with no sales as zeros, with no division by nothing', () => {
        expect(figuresOf(emptyRawFigures(), 'EUR')).toMatchObject({
            orders: 0,
            netSales: 0,
            totalSales: 0,
            averageOrderValue: 0
        });
    });

    it('honours a currency with no minor unit', () => {
        expect(
            figuresOf(
                { ...emptyRawFigures(), orders: 3, invoicedGoods: toMinorUnits(1000, 'JPY') },
                'JPY'
            ).averageOrderValue
        ).toBe(333);
    });
});

describe('addRawFigures', () => {
    it('adds field by field, so a sum of buckets equals the whole', () => {
        const one = { ...emptyRawFigures(), orders: 1, invoicedGoods: eur(0.1) };
        const two = { ...emptyRawFigures(), orders: 2, invoicedGoods: eur(0.2) };

        expect(addRawFigures(one, two)).toMatchObject({ orders: 3, invoicedGoods: eur(0.3) });
    });
});

describe('rateOf', () => {
    it('is the share, and 0 over an empty whole', () => {
        expect(rateOf(1, 4)).toBe(0.25);
        expect(rateOf(3, 0)).toBe(0);
    });
});
