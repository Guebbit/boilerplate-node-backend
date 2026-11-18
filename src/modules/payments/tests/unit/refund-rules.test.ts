/**
 * @module
 * The pure refund rules added by staff's instruments: which refunds are still open, which may be
 * voided, and the legal deadline of a refund that pays for a withdrawal or a return.
 */
import { DisputeKind, DisputeStatus, RefundFailureReason, RefundStatus } from '@types';
import {
    exceedsRemaining,
    hasOpenChargeback,
    hasOpenDispute,
    isOpenRefund,
    lostToChargebacks,
    mayBeCanceled,
    mayBeSettledByHand,
    refundDueBy
} from '@modules/payments/domain';

/** A 100.00 payment with no refunds, on the given provider. */
const paymentOn = (provider: string) => ({
    provider,
    amount: '100.00',
    currency: 'EUR',
    refunds: []
});

/** A refund record of 30.00 in the given state. */
const refundIn = (facts: {
    status: RefundStatus;
    failureReason?: RefundFailureReason;
    reversedAt?: Date;
    reversedAfterSettling?: true;
    providerRefundRef?: string;
}) => ({ amount: '30.00', currency: 'EUR', ...facts });

describe('isOpenRefund', () => {
    it.each([
        [RefundStatus.pending, undefined, true],
        [RefundStatus.failed, RefundFailureReason.unknown, true],
        [RefundStatus.failed, RefundFailureReason.declined, true],
        [RefundStatus.succeeded, undefined, false],
        [RefundStatus.failed, RefundFailureReason.canceled, false]
    ])('reads %s with %s as open: %s', (status, failureReason, expected) => {
        expect(isOpenRefund({ status, failureReason })).toBe(expected);
    });
});

describe('mayBeCanceled', () => {
    it('allows a hand-paid pending refund and refuses a settled or a canceled one', () => {
        const cash = paymentOn('manual');
        expect(mayBeCanceled(cash, refundIn({ status: RefundStatus.pending }))).toBe(true);
        expect(mayBeCanceled(cash, refundIn({ status: RefundStatus.succeeded }))).toBe(false);
        expect(
            mayBeCanceled(
                cash,
                refundIn({
                    status: RefundStatus.failed,
                    failureReason: RefundFailureReason.canceled
                })
            )
        ).toBe(false);
    });

    it('allows a card refund only after a refusal that proves the money did not move', () => {
        const card = paymentOn('stripe');
        const failed = (failureReason: RefundFailureReason) =>
            refundIn({ status: RefundStatus.failed, failureReason });
        expect(mayBeCanceled(card, failed(RefundFailureReason.declined))).toBe(true);
        expect(mayBeCanceled(card, failed(RefundFailureReason.insufficient_funds))).toBe(true);
        expect(mayBeCanceled(card, failed(RefundFailureReason.unknown))).toBe(false);
        expect(mayBeCanceled(card, failed(RefundFailureReason.provider_unavailable))).toBe(false);
        expect(mayBeCanceled(card, refundIn({ status: RefundStatus.pending }))).toBe(false);
        expect(mayBeCanceled(card, failed(RefundFailureReason.canceled))).toBe(false);
    });
});

describe('a refund the provider took back', () => {
    const card = paymentOn('stripe');
    const bounced = refundIn({
        status: RefundStatus.failed,
        failureReason: RefundFailureReason.unknown,
        reversedAt: new Date('2026-03-09T10:00:00.000Z'),
        reversedAfterSettling: true
    });

    it('is owed another way: an operator may report it paid, even for an unclear reason', () => {
        expect(mayBeSettledByHand(card, bounced)).toBe(true);
    });

    it('is not voided when it settled first: it has its credit note', () => {
        expect(mayBeCanceled(card, bounced)).toBe(false);
    });

    it('may be voided when the provider reported it failed while it was still open', () => {
        const { reversedAfterSettling: _settled, ...refused } = bounced;
        expect(mayBeCanceled(card, refused)).toBe(true);
    });

    it('follows the dispute rule when the bank took it back in a dispute', () => {
        const disputed = { ...bounced, failureReason: RefundFailureReason.disputed };
        const open = { ...card, disputes: [chargeback(DisputeStatus.needs_response)] };
        expect(mayBeSettledByHand(open, disputed)).toBe(false);
        expect(mayBeSettledByHand(card, disputed)).toBe(true);
        expect(mayBeCanceled(card, disputed)).toBe(false);
    });
});

describe('exceedsRemaining', () => {
    const settled = { ...refundIn({ status: RefundStatus.succeeded }), amount: '80.00' };

    it('holds an unsent refund that no longer fits what the provider already gave back', () => {
        const payment = { ...paymentOn('stripe'), refunds: [settled] };
        expect(exceedsRemaining(payment, refundIn({ status: RefundStatus.pending }))).toBe(true);
    });

    it('lets one fit that still does, and ignores a refund the provider took back', () => {
        const bouncedFirst = {
            ...settled,
            status: RefundStatus.failed,
            reversedAt: new Date()
        };
        const payment = { ...paymentOn('stripe'), refunds: [bouncedFirst] };
        expect(exceedsRemaining(payment, refundIn({ status: RefundStatus.pending }))).toBe(false);
    });

    it('never holds a refund the provider already holds', () => {
        const payment = { ...paymentOn('stripe'), refunds: [settled] };
        expect(
            exceedsRemaining(
                payment,
                refundIn({ status: RefundStatus.pending, providerRefundRef: 're_1' })
            )
        ).toBe(false);
    });
});

describe('refundDueBy', () => {
    it('is the deadline stamped on the record when it opened', () => {
        const dueBy = new Date('2026-03-15T22:59:59.999Z');
        expect(refundDueBy({ dueBy })).toBe(dueBy);
    });

    it('is absent for a refund the law sets no deadline for', () => {
        expect(refundDueBy({})).toBeUndefined();
    });
});

/** A chargeback of `amount` (100.00 unless said) in the given state. */
const chargeback = (status: DisputeStatus, amount = '100.00') => ({
    kind: DisputeKind.chargeback,
    status,
    amount,
    currency: 'EUR'
});

/** An inquiry of 100.00 in the given state. */
const inquiry = (status: DisputeStatus) => ({
    kind: DisputeKind.inquiry,
    status,
    amount: '100.00',
    currency: 'EUR'
});

describe('the dispute rules', () => {
    it('closes the refund door for an open chargeback only, not for an inquiry', () => {
        expect(hasOpenChargeback({ disputes: [chargeback(DisputeStatus.needs_response)] })).toBe(
            true
        );
        expect(hasOpenChargeback({ disputes: [chargeback(DisputeStatus.under_review)] })).toBe(
            true
        );
        expect(hasOpenChargeback({ disputes: [inquiry(DisputeStatus.needs_response)] })).toBe(
            false
        );
        expect(hasOpenChargeback({ disputes: [chargeback(DisputeStatus.won)] })).toBe(false);
        expect(hasOpenChargeback({})).toBe(false);
    });

    it('counts any open dispute, inquiry included, for the list filter', () => {
        expect(hasOpenDispute({ disputes: [inquiry(DisputeStatus.needs_response)] })).toBe(true);
        expect(hasOpenDispute({ disputes: [inquiry(DisputeStatus.closed)] })).toBe(false);
    });

    it('takes only lost or accepted chargebacks off what can be refunded', () => {
        const taken = (disputes: ReturnType<typeof chargeback>[]) =>
            lostToChargebacks({ disputes }, 'EUR');
        expect(taken([chargeback(DisputeStatus.lost, '40.00')])).toBe(4000);
        expect(
            taken([
                chargeback(DisputeStatus.accepted, '40.00'),
                chargeback(DisputeStatus.lost, '10.00')
            ])
        ).toBe(5000);
        expect(
            taken([
                chargeback(DisputeStatus.won, '40.00'),
                chargeback(DisputeStatus.needs_response)
            ])
        ).toBe(0);
        expect(lostToChargebacks({ disputes: [{ ...inquiry(DisputeStatus.lost) }] }, 'EUR')).toBe(
            0
        );
    });

    it('does not subtract a lost chargeback in another currency than the payment', () => {
        const usd = { ...chargeback(DisputeStatus.lost, '40.00'), currency: 'USD' };
        expect(lostToChargebacks({ disputes: [usd] }, 'EUR')).toBe(0);
        expect(
            lostToChargebacks({ disputes: [usd, chargeback(DisputeStatus.lost, '5.00')] }, 'EUR')
        ).toBe(500);
    });

    describe('a refund refused as disputed', () => {
        const card = paymentOn('stripe');
        const refused = refundIn({
            status: RefundStatus.failed,
            failureReason: RefundFailureReason.disputed
        });

        it('is neither settled nor voided while a chargeback is open', () => {
            const open = { ...card, disputes: [chargeback(DisputeStatus.needs_response)] };
            expect(mayBeSettledByHand(open, refused)).toBe(false);
            expect(mayBeCanceled(open, refused)).toBe(false);
        });

        it('may be settled or voided once a chargeback is lost, whatever the amount it took', () => {
            const small = { ...card, disputes: [chargeback(DisputeStatus.lost, '1.00')] };
            expect(mayBeSettledByHand(small, refused)).toBe(true);
            expect(mayBeCanceled(small, refused)).toBe(true);
        });

        it('may be settled or voided once the shop won', () => {
            const won = { ...card, disputes: [chargeback(DisputeStatus.won)] };
            expect(mayBeSettledByHand(won, refused)).toBe(true);
            expect(mayBeCanceled(won, refused)).toBe(true);
        });

        it('may be settled or voided when no dispute is on file at all', () => {
            expect(mayBeSettledByHand(card, refused)).toBe(true);
            expect(mayBeCanceled(card, refused)).toBe(true);
        });

        it('is not touched while an inquiry is still open, since nothing is decided yet', () => {
            const asked = { ...card, disputes: [inquiry(DisputeStatus.needs_response)] };
            expect(mayBeSettledByHand(asked, refused)).toBe(false);
            expect(mayBeCanceled(asked, refused)).toBe(false);
        });

        it('may be settled or voided once the only inquiry is closed, so it is never stranded', () => {
            const closed = { ...card, disputes: [inquiry(DisputeStatus.closed)] };
            expect(mayBeSettledByHand(closed, refused)).toBe(true);
            expect(mayBeCanceled(closed, refused)).toBe(true);
        });

        it('is not touched while any one of several disputes is open', () => {
            const mixed = {
                ...card,
                disputes: [inquiry(DisputeStatus.closed), chargeback(DisputeStatus.under_review)]
            };
            expect(mayBeSettledByHand(mixed, refused)).toBe(false);
            expect(mayBeCanceled(mixed, refused)).toBe(false);
        });
    });
});
