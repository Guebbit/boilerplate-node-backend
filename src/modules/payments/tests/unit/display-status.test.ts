/**
 * `displayStatusOf` — the label a payment shows. The subject is the refund rule: a refund still
 * open wins over the stored status, and `amountRefunded` (which counts a requested refund as
 * done) is read only once no refund is open.
 */
import {
    PaymentDisplayStatus,
    RefundFailureReason,
    RefundStatus,
    type PaymentStatus
} from '@types';
import { displayStatusOf } from '@modules/payments/domain';

describe('displayStatusOf', () => {
    const open = [{ status: RefundStatus.pending }];
    const failed = [{ status: RefundStatus.failed }];
    const settled = [{ status: RefundStatus.succeeded }];
    // A staff-voided refund is `failed` but closed for good: it must not read as an open one.
    const canceled = [{ status: RefundStatus.failed, failureReason: RefundFailureReason.canceled }];

    const base = { amount: 50, amountRefunded: 0, currency: 'EUR' };

    it.each<
        [
            PaymentStatus,
            { status: RefundStatus; failureReason?: RefundFailureReason }[],
            number,
            PaymentDisplayStatus
        ]
    >([
        ['requires_confirmation', [], 0, PaymentDisplayStatus.incomplete],
        ['requires_action', [], 0, PaymentDisplayStatus.incomplete],
        ['processing', [], 0, PaymentDisplayStatus.pending],
        ['succeeded', [], 0, PaymentDisplayStatus.succeeded],
        ['succeeded', settled, 10, PaymentDisplayStatus.partially_refunded],
        ['succeeded', settled, 50, PaymentDisplayStatus.refunded],
        ['succeeded', [...settled, ...settled], 50, PaymentDisplayStatus.refunded],
        ['succeeded', open, 10, PaymentDisplayStatus.refund_pending],
        ['succeeded', failed, 10, PaymentDisplayStatus.refund_pending],
        ['succeeded', canceled, 0, PaymentDisplayStatus.succeeded],
        ['succeeded', [...canceled, ...settled], 50, PaymentDisplayStatus.refunded],
        ['succeeded', [...settled, ...open], 50, PaymentDisplayStatus.refund_pending],
        ['declined', [], 0, PaymentDisplayStatus.failed],
        ['cancelled', [], 0, PaymentDisplayStatus.cancelled]
    ])(
        'reads %s with refunds %j and %d refunded as %s',
        (status, refunds, amountRefunded, expected) => {
            expect(displayStatusOf({ ...base, status, refunds, amountRefunded })).toBe(expected);
        }
    );

    it('compares the amounts in minor units, so a float sum still reads refunded', () => {
        expect(
            displayStatusOf({
                ...base,
                amount: 0.3,
                amountRefunded: 0.1 + 0.2,
                status: 'succeeded',
                refunds: settled
            })
        ).toBe(PaymentDisplayStatus.refunded);
    });
});
