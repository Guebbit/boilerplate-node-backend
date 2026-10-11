/**
 * `displayStatusOf` — the label a payment shows. The subject is the refund rule: a refund still
 * open wins over the stored status, and `amountRefunded` (which counts a requested refund as
 * done) is never consulted.
 */
import { PaymentDisplayStatus, RefundStatus, type PaymentStatus } from '@types';
import { displayStatusOf } from '@modules/payments/domain';

describe('displayStatusOf', () => {
    const open = [{ status: RefundStatus.pending }];
    const failed = [{ status: RefundStatus.failed }];
    const settled = [{ status: RefundStatus.succeeded }];

    it.each<[PaymentStatus, { status: RefundStatus }[], PaymentDisplayStatus]>([
        ['requires_confirmation', [], PaymentDisplayStatus.incomplete],
        ['requires_action', [], PaymentDisplayStatus.incomplete],
        ['processing', [], PaymentDisplayStatus.pending],
        ['succeeded', [], PaymentDisplayStatus.succeeded],
        ['succeeded', settled, PaymentDisplayStatus.partially_refunded],
        ['succeeded', open, PaymentDisplayStatus.refund_pending],
        ['succeeded', failed, PaymentDisplayStatus.refund_pending],
        ['succeeded', [...settled, ...open], PaymentDisplayStatus.refund_pending],
        ['refunded', settled, PaymentDisplayStatus.refunded],
        ['refunded', open, PaymentDisplayStatus.refund_pending],
        ['declined', [], PaymentDisplayStatus.failed]
    ])('reads %s with refunds %j as %s', (status, refunds, expected) => {
        expect(displayStatusOf({ status, refunds })).toBe(expected);
    });
});
