/**
 * @module
 * Taking some lines out of a hold — the arithmetic of a partial shipment and of a cancelled
 * remainder, pure.
 */

import { takeFromHold } from '../../domain';

describe('takeFromHold', () => {
    const hold = [
        { productId: 'a', quantity: 3 },
        { productId: 'b', quantity: 1 }
    ];

    it('takes what is asked and leaves the rest, per product', () => {
        expect(takeFromHold(hold, [{ productId: 'a', quantity: 2 }])).toEqual({
            remaining: [
                { productId: 'a', quantity: 1 },
                { productId: 'b', quantity: 1 }
            ],
            taken: [{ productId: 'a', quantity: 2 }]
        });
    });

    it('empties the hold when every unit goes', () => {
        const { remaining, taken } = takeFromHold(hold, hold);

        expect(remaining).toEqual([]);
        expect(taken).toEqual(hold);
    });

    it('never takes more than the hold holds of a product, so the counters move by what was set aside', () => {
        expect(takeFromHold(hold, [{ productId: 'b', quantity: 5 }])).toMatchObject({
            taken: [{ productId: 'b', quantity: 1 }],
            remaining: [{ productId: 'a', quantity: 3 }]
        });
    });

    it('takes nothing of a product the hold does not carry', () => {
        expect(takeFromHold(hold, [{ productId: 'z', quantity: 1 }])).toEqual({
            remaining: hold,
            taken: []
        });
    });

    it('sums a product named twice, and sums a product held on two lines', () => {
        const split = takeFromHold(
            [
                { productId: 'a', quantity: 1 },
                { productId: 'a', quantity: 2 }
            ],
            [
                { productId: 'a', quantity: 1 },
                { productId: 'a', quantity: 1 }
            ]
        );

        expect(split).toEqual({
            remaining: [{ productId: 'a', quantity: 1 }],
            taken: [{ productId: 'a', quantity: 2 }]
        });
    });

    it('is pure: the hold it was handed is as it was', () => {
        const before = hold.map((line) => ({ ...line }));

        takeFromHold(hold, [{ productId: 'a', quantity: 2 }]);

        expect(hold).toEqual(before);
    });
});
