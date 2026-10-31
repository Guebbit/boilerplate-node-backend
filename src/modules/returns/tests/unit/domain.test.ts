/**
 * @module
 * The pure rules that decide a return's lines and its first status — no database, so every
 * boundary can be walked.
 */
import {
    BACK_RETURN_STATUSES,
    QUANTITY_HOLDING_RETURN_STATUSES,
    accountsOf,
    checkRequestedLines,
    checkStatement,
    policyExceptionsOf,
    holdsReturnedGoods,
    initialStatusFor,
    quantitiesByProduct,
    reasonsOpenAt,
    resolveRestock,
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

describe('quantitiesByProduct', () => {
    it('sums a product named on several lines, and keeps the others apart', () => {
        const totals = quantitiesByProduct([
            { productId: 'a', quantity: 2 },
            { productId: 'b', quantity: 1 },
            { productId: 'a', quantity: 3 }
        ]);

        expect([...totals]).toEqual([
            ['a', 5],
            ['b', 1]
        ]);
    });

    it('is empty for no lines', () => {
        expect(quantitiesByProduct([]).size).toBe(0);
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

describe('a replacement or a repair', () => {
    it('stops holding its units: the buyer has them again, so they stay returnable', () => {
        for (const remedy of ['replace', 'repair'] as const)
            expect(holdsReturnedGoods({ kind: 'return', status: 'closed', remedy })).toBe(false);
        expect(holdsReturnedGoods({ kind: 'return', status: 'closed', remedy: 'refund' })).toBe(
            true
        );
    });

    it('settles no units and refunds no delivery', () => {
        const accounts = accountsOf(
            [
                {
                    kind: 'return',
                    status: 'closed',
                    remedy: 'replace',
                    lines: [{ productId: id('a'), quantity: 2 }],
                    shippingRefund: 4
                },
                {
                    kind: 'return',
                    status: 'closed',
                    remedy: 'refund',
                    lines: [{ productId: id('b'), quantity: 1 }]
                }
            ],
            'EUR'
        );

        expect(accounts.accountedFor).toEqual([{ productId: 'b', quantity: 1 }]);
        expect(accounts.shippingRefunded).toBe(0);
    });
});

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
                {
                    kind: 'return',
                    status: 'declined',
                    lines: [{ productId: id('a'), quantity: 9 }]
                },
                { kind: 'return', status: 'canceled', lines: [{ productId: id('a'), quantity: 9 }] }
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

describe('reasonsOpenAt', () => {
    const NOW = new Date('2026-06-01T12:00:00Z');
    const past = new Date('2026-05-31T23:59:59.999Z');
    const future = new Date('2026-07-01T23:59:59.999Z');

    it('offers every reason while neither clock has started', () => {
        expect(reasonsOpenAt({}, NOW)).toEqual(['withdrawal', 'defective', 'wrong_item', 'other']);
    });

    it('keeps only the guarantee reasons once the withdrawal period is over', () => {
        expect(reasonsOpenAt({ withdrawUntil: past, conformityUntil: future }, NOW)).toEqual([
            'defective',
            'wrong_item'
        ]);
    });

    it('offers nothing once both deadlines are over', () => {
        expect(reasonsOpenAt({ withdrawUntil: past, conformityUntil: past }, NOW)).toEqual([]);
    });

    it('treats the deadline instant itself as still open', () => {
        expect(reasonsOpenAt({ withdrawUntil: NOW, conformityUntil: NOW }, NOW)).toHaveLength(4);
    });
});

describe('resolveRestock', () => {
    const returned = [
        { productId: id('a'), quantity: 3 },
        { productId: id('b'), quantity: 1 }
    ];

    it('puts everything back when no counts are given', () => {
        expect(resolveRestock(returned, undefined)).toEqual({ ok: true, restocked: [3, 1] });
        expect(resolveRestock(returned, [])).toEqual({ ok: true, restocked: [3, 1] });
    });

    it('puts back the named count and the rest in full, in the line order', () => {
        expect(resolveRestock(returned, [{ productId: 'b', restock: 0 }])).toEqual({
            ok: true,
            restocked: [3, 0]
        });
        expect(resolveRestock(returned, [{ productId: 'a', restock: 2 }])).toEqual({
            ok: true,
            restocked: [2, 1]
        });
    });

    it('accepts exactly the line quantity, and zero', () => {
        expect(
            resolveRestock(returned, [
                { productId: 'a', restock: 3 },
                { productId: 'b', restock: 0 }
            ])
        ).toEqual({ ok: true, restocked: [3, 0] });
    });

    it('refuses a product the return does not hold, pointing at its entry', () => {
        expect(
            resolveRestock(returned, [
                { productId: 'a', restock: 1 },
                { productId: 'z', restock: 1 }
            ])
        ).toEqual({ ok: false, index: 1, reason: 'unknown-product' });
    });

    it('refuses a product named twice, at the second entry', () => {
        expect(
            resolveRestock(returned, [
                { productId: 'a', restock: 1 },
                { productId: 'a', restock: 2 }
            ])
        ).toEqual({ ok: false, index: 1, reason: 'duplicate' });
    });

    it('refuses one more than the line holds', () => {
        expect(resolveRestock(returned, [{ productId: 'b', restock: 2 }])).toEqual({
            ok: false,
            index: 0,
            reason: 'too-many'
        });
    });
});

describe('checkStatement', () => {
    const now = new Date('2026-06-10T12:00:00Z');
    const orderCreatedAt = new Date('2026-05-01T12:00:00Z');
    const base = { kind: 'return' as const, orderCreatedAt, now };

    it('stamps the buyer’s own request with now, and a withdrawal online', () => {
        expect(checkStatement({ ...base, byBuyer: true, reason: 'defective' })).toEqual({
            ok: true,
            requestedAt: now
        });
        expect(checkStatement({ ...base, byBuyer: true, reason: 'withdrawal' })).toEqual({
            ok: true,
            requestedAt: now,
            statedVia: 'online'
        });
    });

    it('refuses the buyer sending either field', () => {
        expect(
            checkStatement({ ...base, byBuyer: true, reason: 'withdrawal', requestedAt: now })
        ).toEqual({ ok: false, field: 'requestedAt', reason: 'forbidden' });
        expect(
            checkStatement({ ...base, byBuyer: true, reason: 'withdrawal', statedVia: 'phone' })
        ).toEqual({ ok: false, field: 'statedVia', reason: 'forbidden' });
    });

    it('requires both fields of staff recording a withdrawal', () => {
        const staff = { ...base, byBuyer: false, reason: 'withdrawal' as const };
        expect(checkStatement(staff)).toEqual({
            ok: false,
            field: 'requestedAt',
            reason: 'required'
        });
        expect(checkStatement({ ...staff, requestedAt: now })).toEqual({
            ok: false,
            field: 'statedVia',
            reason: 'required'
        });
        expect(checkStatement({ ...staff, requestedAt: now, statedVia: 'letter' })).toEqual({
            ok: true,
            requestedAt: now,
            statedVia: 'letter'
        });
    });

    it('defaults staff’s date to now for another reason, and takes no channel', () => {
        const staff = { ...base, byBuyer: false, reason: 'other' as const };
        expect(checkStatement(staff)).toEqual({ ok: true, requestedAt: now });
        expect(checkStatement({ ...staff, statedVia: 'phone' })).toEqual({
            ok: false,
            field: 'statedVia',
            reason: 'forbidden'
        });
    });

    it('takes no date on a staff remainder cancel for their own reason', () => {
        expect(
            checkStatement({
                ...base,
                kind: 'cancellation',
                byBuyer: false,
                reason: 'other',
                requestedAt: now
            })
        ).toEqual({ ok: false, field: 'requestedAt', reason: 'forbidden' });
    });

    it('bounds the date by the order and now, both ends inclusive', () => {
        const staff = { ...base, byBuyer: false, reason: 'other' as const };
        expect(checkStatement({ ...staff, requestedAt: orderCreatedAt }).ok).toBe(true);
        expect(checkStatement({ ...staff, requestedAt: now }).ok).toBe(true);
        expect(checkStatement({ ...staff, requestedAt: new Date(now.getTime() + 1) })).toEqual({
            ok: false,
            field: 'requestedAt',
            reason: 'future'
        });
        expect(
            checkStatement({ ...staff, requestedAt: new Date(orderCreatedAt.getTime() - 1) })
        ).toEqual({ ok: false, field: 'requestedAt', reason: 'before-order' });
    });
});

describe('policyExceptionsOf', () => {
    const asked = new Date('2026-06-10T12:00:00Z');
    const open = { withdrawUntil: new Date('2026-06-20T00:00:00Z') };
    const closed = { withdrawUntil: new Date('2026-06-01T00:00:00Z') };

    it('records nothing when the deadline was open that day and no excluded goods are taken', () => {
        expect(policyExceptionsOf(open, 'other', asked, false)).toEqual([]);
    });

    it('records window_closed when the deadline had passed on the day the buyer asked', () => {
        expect(policyExceptionsOf(closed, 'other', asked, false)).toEqual(['window_closed']);
    });

    it('records excluded_goods for a goodwill return, never for the guarantee', () => {
        expect(policyExceptionsOf(open, 'other', asked, true)).toEqual(['excluded_goods']);
        expect(policyExceptionsOf(open, 'defective', asked, true)).toEqual([]);
    });

    it('records both, in that order', () => {
        expect(policyExceptionsOf(closed, 'other', asked, true)).toEqual([
            'window_closed',
            'excluded_goods'
        ]);
    });
});
