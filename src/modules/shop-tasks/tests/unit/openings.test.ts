/**
 * @module
 * What each shop situation opens — `src/modules/shop-tasks/domain/openings.ts`. Pure: no mocks,
 * no database. The consent reminder is the one with a table of its own (16 CFR 435.2), so it gets
 * every row, and the rule's reach follows the shop's country.
 */

import { PERMISSION_SETS } from '@kernel/permissions';
import { TaskKind, TaskLinkType } from '@types';
import { openKeyOf, type SystemOpening } from '@modules/tasks';
import {
    amountMismatchOpening,
    consentDueOpening,
    disputeAwaitingBankOpening,
    disputeOpening,
    paidWithoutHoldOpening,
    refundOwedOpening,
    refundRefusedOpening,
    refundOwedAfterDisputeOpening,
    refundReversedOpening,
    refundUnrecordedOpening,
    returnRefundShortOpening
} from '../../domain/openings';

/** The instant openings are judged at. */
const NOW = new Date('2030-05-01T10:00:00Z');
/** One day in milliseconds. */
const DAY_MS = 86_400_000;
/** The delivery date the buyer agreed to. */
const AGREED = '2030-06-01T00:00:00.000Z';
/** One day in milliseconds. */
const AGREED_PLUS_30 = new Date(new Date(AGREED).getTime() + 30 * DAY_MS);

/** A delay notice, overridable. */
const delay = (overrides = {}) => ({
    fulfillmentOrderId: 'fo1',
    orderId: 'o1',
    agreedAt: AGREED,
    promisedAt: AGREED,
    shipCountry: 'US',
    ...overrides
});

describe('consentDueOpening — a delay the buyer must be asked about', () => {
    it('opens, due agreed + 30 days, when no new date is given to a buyer holding the ordered date', () => {
        const opening = consentDueOpening(delay(), 'IT');
        expect(opening?.kind).toBe(TaskKind.consent_due);
        expect(opening?.routeSet).toBe('OrderEditing');
        expect(opening?.link).toEqual({ type: TaskLinkType.fulfillment_order, id: 'fo1' });
        expect(opening?.dueAt).toEqual(AGREED_PLUS_30);
    });

    it('opens when the new date is past agreed + 30 days', () => {
        const expectedAt = new Date(AGREED_PLUS_30.getTime() + DAY_MS).toISOString();
        expect(consentDueOpening(delay({ expectedAt }), 'IT')?.dueAt).toEqual(AGREED_PLUS_30);
    });

    it('does not open for a new date inside agreed + 30 days, the grace the law allows', () => {
        const expectedAt = AGREED_PLUS_30.toISOString();
        expect(consentDueOpening(delay({ expectedAt }), 'IT')).toBeUndefined();
    });

    it('measures a later slip against the date the buyer now holds, and is due on it', () => {
        const promisedAt = '2030-07-15T00:00:00.000Z';
        const inside = consentDueOpening(delay({ promisedAt, expectedAt: promisedAt }), 'IT');
        const later = consentDueOpening(
            delay({ promisedAt, expectedAt: '2030-07-16T00:00:00.000Z' }),
            'IT'
        );
        const none = consentDueOpening(delay({ promisedAt }), 'IT');
        expect(inside).toBeUndefined();
        expect(later?.dueAt).toEqual(new Date(promisedAt));
        expect(none?.dueAt).toEqual(new Date(promisedAt));
    });

    it('never opens for a buyer who was told there is no date yet: the earlier task stands', () => {
        expect(consentDueOpening(delay({ promisedAt: undefined }), 'IT')).toBeUndefined();
    });

    /**
     * The six jurisdictions the FTC Rule binds: written out, not read
     * from the constant under test.
     *
     * @see docs/modules/shop-tasks.md#the-shop-s-to-dos
     */
    it.each(['US', 'PR', 'GU', 'VI', 'AS', 'MP'])(
        'opens for a shop in %s, whatever the destination',
        (country) => {
            expect(consentDueOpening(delay({ shipCountry: 'IT' }), country)).toBeDefined();
            expect(consentDueOpening(delay({ shipCountry: undefined }), country)).toBeDefined();
        }
    );

    it.each(['US', 'PR', 'GU', 'VI', 'AS', 'MP'])(
        'opens for a shop elsewhere shipping to %s',
        (shipCountry) => {
            expect(consentDueOpening(delay({ shipCountry }), 'DE')).toBeDefined();
        }
    );

    it.each([['DE'], [undefined]])(
        'never opens for a shop outside the rule shipping to %s',
        (shipCountry) => {
            expect(consentDueOpening(delay({ shipCountry }), 'IT')).toBeUndefined();
            expect(consentDueOpening(delay({ shipCountry }), undefined)).toBeUndefined();
        }
    );
});

/** A refund the import could not record, for the cases below. */
const UNRECORDED = {
    paymentId: 'p1',
    orderId: 'o1',
    refundRef: 're_1',
    amount: '30.00',
    currency: 'EUR',
    reason: 'lost_race'
} as const;

describe('the other openings', () => {
    const all: [string, SystemOpening][] = [
        ['refund owed', refundOwedOpening({ refundId: 'r1', orderId: 'o1' }, NOW)],
        ['amount mismatch', amountMismatchOpening({ paymentId: 'p1', orderId: 'o1' }, NOW)],
        ['refund unrecorded', refundUnrecordedOpening(UNRECORDED, NOW)],
        [
            'return refund short',
            returnRefundShortOpening(
                {
                    returnId: 'r1',
                    orderId: 'o1',
                    asked: '100.00',
                    opened: '70.00',
                    currency: 'EUR',
                    cause: 'used_up'
                },
                NOW
            )
        ],
        ['paid without hold', paidWithoutHoldOpening('o1', NOW)],
        [
            'refund refused',
            refundRefusedOpening({ refundId: 'r1', orderId: 'o1', failureReason: 'declined' }, NOW)
        ],
        [
            'dispute',
            disputeOpening(
                {
                    paymentId: 'p1',
                    disputeId: 'dp1',
                    orderId: 'o1',
                    kind: 'chargeback',
                    reason: 'fraudulent'
                },
                NOW
            )
        ]
    ];

    it.each(all)('%s names its kind, its record and a declared route set', (_name, opening) => {
        expect(Object.values(TaskKind)).toContain(opening.kind);
        expect(PERMISSION_SETS.map((set) => set.name)).toContain(opening.routeSet);
        expect(openKeyOf(opening.kind, opening.link)).toBe(
            `${opening.kind}:${opening.link.type}:${opening.link.id}`
        );
    });

    it('tells administrators alone about an amount mismatch: it is a question about the books', () => {
        expect(amountMismatchOpening({ paymentId: 'p1', orderId: 'o1' }, NOW).routeSet).toBe(
            'AuditDisplay'
        );
    });

    it('sends staff to Re-sync for a lost race, and to their books for another currency', () => {
        const lost = refundUnrecordedOpening(UNRECORDED, NOW).message;
        const other = refundUnrecordedOpening(
            { ...UNRECORDED, currency: 'USD', reason: 'other_currency' },
            NOW
        ).message;

        expect(lost).toContain('Re-sync refunds');
        expect(lost).toContain('30.00 EUR');
        expect(other).toContain('30.00 USD');
        expect(other).toContain('record it outside the app');
    });

    it('dates a dispute by the provider deadline, else the fallback', () => {
        const base = {
            paymentId: 'p1',
            disputeId: 'dp1',
            orderId: 'o1',
            kind: 'inquiry',
            reason: 'general'
        };
        const evidenceDueBy = '2030-05-20T00:00:00.000Z';
        expect(disputeOpening({ ...base, evidenceDueBy }, NOW).dueAt).toEqual(
            new Date(evidenceDueBy)
        );
        expect(disputeOpening(base, NOW).dueAt).toEqual(NOW);
    });

    it('is about a record, not a person: none of them ties itself to an account', () => {
        for (const [, opening] of all) expect(opening.subjectId).toBeUndefined();
    });

    it('carries ids only, never an address or a name', () => {
        for (const [, opening] of all) expect(opening.message).not.toMatch(/@/);
    });
});

describe('disputeAwaitingBankOpening', () => {
    it('waits on the payment, 75 days out, with no due-soon reminder', () => {
        const opening = disputeAwaitingBankOpening({ paymentId: 'p1', disputeId: 'dp1' }, NOW);

        expect(opening).toMatchObject({
            kind: TaskKind.dispute_awaiting_bank,
            routeSet: 'PaymentRefunding',
            link: { type: TaskLinkType.dispute, id: 'dp1' },
            noDueSoon: true
        });
        expect(opening.dueAt).toEqual(new Date(NOW.getTime() + 75 * DAY_MS));
    });
});

describe('refund openings', () => {
    it('words a refusal without offering to cancel it, and a reversal as money owed again', () => {
        const refund = { refundId: 'r1', orderId: 'o1', failureReason: 'declined' };

        const refused = refundRefusedOpening(refund, NOW);
        const reversed = refundReversedOpening(refund, NOW);

        expect(refused.message).not.toContain('cancel');
        expect(reversed).toMatchObject({
            kind: TaskKind.refund_reversed,
            routeSet: 'PaymentRefunding',
            link: { type: TaskLinkType.refund, id: 'r1' },
            subject: 'Refund sent back by the bank',
            dueAt: NOW
        });
        expect(reversed.message).not.toContain('cancel');
    });
});

describe('the legal deadline in a refund to-do', () => {
    const refund = { refundId: 'r1', orderId: 'o1', failureReason: 'declined' };

    it('names the withdrawal rule and the shop day', () => {
        const opening = refundRefusedOpening(refund, NOW, {
            rule: 'withdrawal',
            day: '2030-05-15'
        });

        expect(opening.message).toContain('Legal refund deadline (withdrawal): 2030-05-15.');
    });

    it('says a faulty item is due now, with no date', () => {
        const opening = refundReversedOpening(refund, NOW, { rule: 'faulty', day: '2030-05-01' });

        expect(opening.message).toContain('Legal refund deadline (faulty item): refund now.');
        expect(opening.message).not.toContain('2030-05-01');
    });

    it('adds nothing when the law sets no deadline', () => {
        expect(refundRefusedOpening(refund, NOW).message).not.toContain('Legal refund deadline');
    });
});

describe('a dispute is a record of its own', () => {
    it('keys both dispute to-dos by the dispute, so two disputes on one payment never share one', () => {
        const base = { paymentId: 'p1', orderId: 'o1', kind: 'chargeback', reason: 'fraudulent' };
        const first = disputeOpening({ ...base, disputeId: 'dp1' }, NOW);
        const second = disputeOpening({ ...base, disputeId: 'dp2' }, NOW);
        const waiting = disputeAwaitingBankOpening({ paymentId: 'p1', disputeId: 'dp1' }, NOW);

        expect(openKeyOf(first.kind, first.link)).not.toBe(openKeyOf(second.kind, second.link));
        expect(waiting.link).toEqual(first.link);
    });
});

describe('returnRefundShortOpening by cause', () => {
    const short = {
        returnId: 'r1',
        orderId: 'o1',
        asked: '100.00',
        opened: '0.00',
        currency: 'EUR'
    };

    it('says nothing was sent when no payment stands behind the order, not that the rest went back', () => {
        const { message } = returnRefundShortOpening({ ...short, cause: 'no_payment' }, NOW);

        expect(message).toContain('no succeeded payment stands behind the order');
        expect(message).not.toContain('already went back another way');
    });

    it('says the rest of the payment already went back when it was used up', () => {
        const { message } = returnRefundShortOpening({ ...short, cause: 'used_up' }, NOW);

        expect(message).toContain('already went back another way');
    });
});

describe('refundOwedAfterDisputeOpening', () => {
    const refund = {
        refundId: 'r1',
        orderId: 'o1',
        amount: '30.00',
        currency: 'EUR',
        reversed: false,
        bankKept: true
    };

    it('leads with the outcome when the bank kept the money: pay nothing again, mark it returned', () => {
        const opening = refundOwedAfterDisputeOpening(refund, NOW);

        expect(opening).toMatchObject({
            kind: TaskKind.refund_refused,
            routeSet: 'PaymentRefunding',
            link: { type: TaskLinkType.refund, id: 'r1' }
        });
        expect(opening.message).toContain('the bank kept the money, so the buyer already has it');
        expect(opening.message).toContain('mark the refund returned');
        expect(opening.message).not.toContain('Void the refund');
    });

    it('says to void then refund by card when the shop won', () => {
        const { message } = refundOwedAfterDisputeOpening({ ...refund, bankKept: false }, NOW);

        expect(message).toContain('the money stayed with the shop');
        expect(message).toContain('Void the refund, then refund the buyer by card');
    });

    it('never offers a void for a refund the bank took back after it settled', () => {
        const opening = refundOwedAfterDisputeOpening(
            { ...refund, bankKept: false, reversed: true },
            NOW
        );

        expect(opening.kind).toBe(TaskKind.refund_reversed);
        expect(opening.message).not.toContain('Void');
        expect(opening.message).toContain('mark the refund returned');
    });

    it('warns about the amount only when the bank kept money in another currency', () => {
        const other = refundOwedAfterDisputeOpening({ ...refund, otherCurrency: 'USD' }, NOW);
        const same = refundOwedAfterDisputeOpening(refund, NOW);

        expect(other.message).toContain('check the amount in the provider');
        expect(other.message).toContain('USD');
        expect(same.message).not.toContain('check the amount in the provider');
    });

    it('names the legal deadline beside the date', () => {
        const { message } = refundOwedAfterDisputeOpening(refund, NOW, {
            rule: 'withdrawal',
            day: '2030-05-20'
        });

        expect(message).toContain('Legal refund deadline (withdrawal): 2030-05-20.');
    });

    it('tells staff a refund marked returned is owed again after a win, to be paid outside and closed', () => {
        const { kind, message } = refundOwedAfterDisputeOpening(
            { ...refund, bankKept: false, reversed: true, markedReturned: true },
            NOW
        );

        expect(kind).toBe(TaskKind.refund_reversed);
        expect(message).toContain('marked returned because the bank had kept the money');
        expect(message).toContain('the dispute was then won');
        expect(message).toContain('then close this to-do');
        expect(message).not.toContain('mark the refund returned');
    });
});
