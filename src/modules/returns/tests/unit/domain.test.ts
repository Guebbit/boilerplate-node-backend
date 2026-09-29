/**
 * @module
 * The pure rules that decide a return's lines and its first status — no database, so every
 * boundary can be walked.
 */
import {
    DECIDABLE_RETURN_STATUSES,
    QUANTITY_HOLDING_RETURN_STATUSES,
    RECEIVABLE_RETURN_STATUSES,
    checkRequestedLines,
    initialStatusFor,
    returnableQuantities
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
