/**
 * @module
 * What a dispute ending leaves owed — `src/modules/payments/domain/dispute-end.ts`. Pure: no database. The refund
 * states and the dispute states are the whole table, so each row names one.
 */

import { DisputeKind, DisputeStatus, RefundFailureReason, RefundStatus } from '@types';
import {
    disputeBehindRefund,
    keptInOtherCurrency,
    refundsOwedAfterDispute,
    refundsOwedAfterWin,
    type DisputeFacts
} from '../../domain';

/** A refund record as the rule reads it, overridable. */
const refund = (id: string, over: Record<string, unknown> = {}) => ({
    _id: { toString: () => id },
    amount: '30.00',
    currency: 'EUR',
    status: RefundStatus.failed,
    failureReason: RefundFailureReason.disputed,
    ...over
});

/** A dispute as stored, overridable. */
const dispute = (over: Partial<DisputeFacts> = {}): DisputeFacts => ({
    kind: DisputeKind.chargeback,
    status: DisputeStatus.lost,
    amount: '100.00',
    currency: 'EUR',
    ...over
});

/** A stored dispute with the fields that name and order it. */
const stored = (disputeRef: string, minutes: number, over: Partial<DisputeFacts> = {}) => ({
    ...dispute(over),
    disputeRef,
    observedAt: new Date(Date.UTC(2026, 9, 1, 10, minutes))
});

/** A refund marked returned, against `against`, as the rule reads it. */
const returned = (id: string, against: string | undefined) =>
    refund(id, {
        status: RefundStatus.succeeded,
        failureReason: undefined,
        settledAgainstDispute: against
    });

describe('refundsOwedAfterDispute', () => {
    it('lists each open refund refused as disputed, in the payment’s order', () => {
        const ended = dispute();

        const owed = refundsOwedAfterDispute(
            { currency: 'EUR', disputes: [ended], refunds: [refund('a'), refund('b')] },
            ended
        );

        expect(owed.map(({ refundId }) => refundId)).toEqual(['a', 'b']);
    });

    it.each([
        ['settled', { status: RefundStatus.succeeded }],
        ['voided', { failureReason: RefundFailureReason.canceled }],
        ['refused for another reason', { failureReason: RefundFailureReason.declined }],
        ['still being sent', { status: RefundStatus.pending, failureReason: undefined }]
    ] as const)('leaves out a refund that is %s', (_name, over) => {
        const ended = dispute();

        expect(
            refundsOwedAfterDispute(
                { currency: 'EUR', disputes: [ended], refunds: [refund('a', over)] },
                ended
            )
        ).toEqual([]);
    });

    it('lists nothing while another dispute on the payment is still open', () => {
        const ended = dispute();
        const stillOpen = dispute({ status: DisputeStatus.needs_response });

        expect(
            refundsOwedAfterDispute(
                { currency: 'EUR', disputes: [ended, stillOpen], refunds: [refund('a')] },
                ended
            )
        ).toEqual([]);
    });

    it('marks a refund the bank took back after settling as reversed', () => {
        const ended = dispute();

        const [owed] = refundsOwedAfterDispute(
            {
                currency: 'EUR',
                disputes: [ended],
                refunds: [refund('a', { reversedAt: new Date() })]
            },
            ended
        );

        expect(owed.reversed).toBe(true);
    });

    it.each([
        [DisputeKind.chargeback, DisputeStatus.lost, true],
        [DisputeKind.chargeback, DisputeStatus.accepted, true],
        [DisputeKind.chargeback, DisputeStatus.won, false],
        [DisputeKind.chargeback, DisputeStatus.closed, false],
        [DisputeKind.inquiry, DisputeStatus.lost, false]
    ] as const)('says the bank kept the money for a %s that ended %s: %s', (kind, status, kept) => {
        const ended = dispute({ kind, status });

        const [owed] = refundsOwedAfterDispute(
            { currency: 'EUR', disputes: [ended], refunds: [refund('a')] },
            ended
        );

        expect(owed.bankKept).toBe(kept);
    });
});

describe('keptInOtherCurrency', () => {
    it('is true only for money the bank kept in a currency other than the payment’s', () => {
        expect(keptInOtherCurrency(dispute({ currency: 'USD' }), 'EUR')).toBe(true);
        expect(keptInOtherCurrency(dispute({ currency: 'EUR' }), 'EUR')).toBe(false);
        expect(
            keptInOtherCurrency(dispute({ currency: 'USD', status: DisputeStatus.won }), 'EUR')
        ).toBe(false);
    });
});

describe('disputeBehindRefund', () => {
    const refused = { failureReason: RefundFailureReason.disputed };

    it('names the latest dispute the bank kept money in', () => {
        const disputes = [
            stored('old', 0),
            stored('new', 30),
            stored('open', 60, { status: DisputeStatus.needs_response })
        ];

        expect(disputeBehindRefund({ disputes }, refused)).toBe('new');
    });

    it('names none for a refund not refused as disputed, or when the bank kept nothing', () => {
        const kept = [stored('a', 0)];

        expect(
            disputeBehindRefund({ disputes: kept }, { failureReason: undefined })
        ).toBeUndefined();
        expect(
            disputeBehindRefund(
                { disputes: [stored('a', 0, { status: DisputeStatus.won })] },
                refused
            )
        ).toBeUndefined();
        expect(disputeBehindRefund({}, refused)).toBeUndefined();
    });
});

describe('refundsOwedAfterWin', () => {
    const lost = dispute();
    const won = dispute({ status: DisputeStatus.won });

    it('lists the refunds marked returned against this dispute, as owed again', () => {
        const owed = refundsOwedAfterWin(
            {
                currency: 'EUR',
                refunds: [returned('a', 'dp1'), returned('b', 'dp2'), returned('c', undefined)]
            },
            lost,
            won,
            'dp1'
        );

        expect(owed).toEqual([
            expect.objectContaining({
                refundId: 'a',
                reversed: true,
                bankKept: false,
                markedReturned: true
            })
        ]);
    });

    it.each([
        ['it was not lost before', won, won],
        ['it is still lost', lost, lost]
    ] as const)('lists nothing when %s', (_name, previous, now) => {
        expect(
            refundsOwedAfterWin(
                { currency: 'EUR', refunds: [returned('a', 'dp1')] },
                previous,
                now,
                'dp1'
            )
        ).toEqual([]);
    });
});
