/**
 * @module
 * The pure rules that decide a return's lines and its first status — no database, so every
 * boundary can be walked.
 */
import {
    BACK_RETURN_STATUSES,
    DECIDABLE_RETURN_STATUSES,
    QUANTITY_HOLDING_RETURN_STATUSES,
    RECEIVABLE_RETURN_STATUSES,
    accountsOf,
    checkRequestedLines,
    holdsReturnedGoods,
    initialStatusFor,
    returnableLinesOf,
    returnableQuantities,
    takesLastUnit,
    wireLines
} from '../../domain';

describe('initialStatusFor', () => {
    it('opens a withdrawal already approved — nobody grants a right', () => {
        expect(initialStatusFor('withdrawal')).toBe('approved');
    });

    it.each(['defective', 'wrong_item', 'other'] as const)(
        'makes a %s return wait for staff',
        (reason) => {
            expect(initialStatusFor(reason)).toBe('requested');
        }
    );
});

describe('the lifecycle sets', () => {
    it('lets staff decide only a request nobody has answered', () => {
        expect(DECIDABLE_RETURN_STATUSES).toEqual(['requested']);
    });

    it('lets goods be received only against an approved return', () => {
        expect(RECEIVABLE_RETURN_STATUSES).toEqual(['approved']);
    });

    it('does not count a declined return against what can still come back', () => {
        expect(QUANTITY_HOLDING_RETURN_STATUSES).not.toContain('declined');
        expect(QUANTITY_HOLDING_RETURN_STATUSES).toEqual(
            expect.arrayContaining(['requested', 'approved', 'received', 'closed'])
        );
    });
});

describe('wireLines', () => {
    it('keys each line by the id as a string and keeps the quantity', () => {
        const id = { toString: () => 'abc123' };

        expect(wireLines([{ productId: id, quantity: 2 }])).toEqual([
            { productId: 'abc123', quantity: 2 }
        ]);
    });
});

describe('returnableLinesOf', () => {
    const items = [
        { product: { _id: { toString: () => 'a' } }, quantity: 1, digital: false },
        { product: { _id: { toString: () => 'b' } }, quantity: 3, digital: true }
    ];

    it('drops the goods the predicate excludes and keys the rest by string id', () => {
        expect(returnableLinesOf(items, (item) => item.digital)).toEqual([
            { productId: 'a', quantity: 1 }
        ]);
    });

    it('keeps everything when nothing is excluded', () => {
        expect(returnableLinesOf(items, () => false)).toHaveLength(2);
    });
});

describe('returnableQuantities', () => {
    it('is what the order held, less what earlier returns took', () => {
        const left = returnableQuantities(
            [
                { productId: 'a', quantity: 3 },
                { productId: 'b', quantity: 1 }
            ],
            [{ productId: 'a', quantity: 2 }]
        );

        expect(Object.fromEntries(left)).toEqual({ a: 1, b: 1 });
    });

    it('sums a product that sits on two lines', () => {
        const left = returnableQuantities(
            [
                { productId: 'a', quantity: 1 },
                { productId: 'a', quantity: 2 }
            ],
            []
        );

        expect(left.get('a')).toBe(3);
    });

    it('never goes below zero', () => {
        const left = returnableQuantities(
            [{ productId: 'a', quantity: 1 }],
            [{ productId: 'a', quantity: 5 }]
        );

        expect(left.get('a')).toBe(0);
    });
});

describe('checkRequestedLines', () => {
    const remaining = new Map([
        ['a', 2],
        ['b', 0],
        ['c', 1]
    ]);

    it('takes everything left when no lines are named, and skips what is used up', () => {
        expect(checkRequestedLines(remaining, undefined)).toEqual({
            ok: true,
            lines: [
                { productId: 'a', quantity: 2 },
                { productId: 'c', quantity: 1 }
            ]
        });
    });

    it('treats an empty list like no list', () => {
        expect(checkRequestedLines(remaining, [])).toMatchObject({ ok: true });
    });

    it('says nothing is left when everything has already come back', () => {
        expect(checkRequestedLines(new Map([['a', 0]]), undefined)).toEqual({
            ok: false,
            reason: 'nothing-returnable'
        });
    });

    it('accepts exactly what is left, and not one more', () => {
        expect(checkRequestedLines(remaining, [{ productId: 'a', quantity: 2 }])).toMatchObject({
            ok: true
        });
        expect(checkRequestedLines(remaining, [{ productId: 'a', quantity: 3 }])).toEqual({
            ok: false,
            reason: 'too-many'
        });
    });

    it('refuses a product the order never held', () => {
        expect(checkRequestedLines(remaining, [{ productId: 'z', quantity: 1 }])).toEqual({
            ok: false,
            reason: 'unknown-product'
        });
    });

    it('refuses a product with nothing left', () => {
        expect(checkRequestedLines(remaining, [{ productId: 'b', quantity: 1 }])).toEqual({
            ok: false,
            reason: 'too-many'
        });
    });

    it('adds up a product named twice before comparing — two ones are not a way past a limit of one', () => {
        expect(
            checkRequestedLines(remaining, [
                { productId: 'c', quantity: 1 },
                { productId: 'c', quantity: 1 }
            ])
        ).toEqual({ ok: false, reason: 'too-many' });
    });
});

/** A product id as the rules see one: anything that stringifies to it. */
const id = (value: string) => ({ toString: () => value });

describe('holdsReturnedGoods', () => {
    it('counts a return that holds goods, whichever stage it is at', () => {
        for (const status of QUANTITY_HOLDING_RETURN_STATUSES)
            expect(holdsReturnedGoods({ kind: 'return', status })).toBe(true);
        expect(holdsReturnedGoods({ kind: 'return', status: 'declined' })).toBe(false);
    });

    it('never counts a cancellation: its units never shipped, so none of them can come back', () => {
        expect(holdsReturnedGoods({ kind: 'cancellation', status: 'closed' })).toBe(false);
    });
});

describe('takesLastUnit', () => {
    const ordered = [
        { productId: 'a', quantity: 2 },
        { productId: 'b', quantity: 1 }
    ];

    it('is true when every ordered unit is accounted for, by anything', () => {
        expect(
            takesLastUnit(ordered, [
                { productId: 'a', quantity: 1 },
                { productId: 'a', quantity: 1 },
                { productId: 'b', quantity: 1 }
            ])
        ).toBe(true);
    });

    it('is false while a single unit of any product is unaccounted for', () => {
        expect(
            takesLastUnit(ordered, [
                { productId: 'a', quantity: 2 },
                { productId: 'b', quantity: 0 }
            ])
        ).toBe(false);
        expect(takesLastUnit(ordered, [{ productId: 'b', quantity: 1 }])).toBe(false);
        expect(takesLastUnit(ordered, [])).toBe(false);
    });

    it('is counted against the ORDERED quantity, so a product never accounted for keeps it false', () => {
        expect(
            takesLastUnit(ordered, [
                { productId: 'a', quantity: 5 },
                { productId: 'c', quantity: 9 }
            ])
        ).toBe(false);
    });
});

describe('accountsOf', () => {
    it('counts a cancellation and a return whose goods are back, and not one still on its way', () => {
        const accounts = accountsOf(
            [
                {
                    kind: 'cancellation',
                    status: 'closed',
                    lines: [{ productId: id('a'), quantity: 1 }],
                    shippingRefund: 4
                },
                {
                    kind: 'return',
                    status: 'received',
                    lines: [{ productId: id('b'), quantity: 1 }]
                },
                {
                    kind: 'return',
                    status: 'approved',
                    lines: [{ productId: id('a'), quantity: 9 }]
                },
                { kind: 'return', status: 'declined', lines: [{ productId: id('a'), quantity: 9 }] }
            ],
            'EUR'
        );

        expect(accounts.accountedFor).toEqual([
            { productId: 'a', quantity: 1 },
            { productId: 'b', quantity: 1 }
        ]);
    });

    it('sums the delivery already refunded, from the ones that settled', () => {
        const accounts = accountsOf(
            [
                { kind: 'cancellation', status: 'closed', lines: [], shippingRefund: 4 },
                { kind: 'return', status: 'closed', lines: [], shippingRefund: 1.5 },
                { kind: 'return', status: 'requested', lines: [], shippingRefund: 99 }
            ],
            'EUR'
        );

        expect(accounts.shippingRefunded).toBe(5.5);
    });

    it('sums in minor units, so thirds of a cent cannot drift', () => {
        const refunds = [0.1, 0.2].map((shippingRefund) => ({
            kind: 'return' as const,
            status: 'closed' as const,
            lines: [],
            shippingRefund
        }));

        expect(accountsOf(refunds, 'EUR').shippingRefunded).toBe(0.3);
    });

    it('is empty for an order with no returns', () => {
        expect(accountsOf([], 'EUR')).toEqual({ accountedFor: [], shippingRefunded: 0 });
    });

    it('treats the settled statuses as received and closed', () => {
        expect(BACK_RETURN_STATUSES).toEqual(['received', 'closed']);
    });
});
