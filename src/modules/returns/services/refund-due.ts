/**
 * @module
 * The legal deadline `returns` stamps on the refund it opens. The rule table is pure
 * (`../domain/refund-due.ts`); this adds the one thing a domain file cannot reach, the shop's
 * calendar.
 *
 * @see docs/modules/returns.md#the-refund-deadline
 */

import { withdrawalRefundDueBy } from '@modules/orders';
import { shopTimezone } from '@modules/shop';
import { refundDueByOf, type ReturnRefundDue } from '../domain';
import type { ReturnDocument } from '../model';

/**
 * The deadline to stamp on a return's refund as it opens.
 * @param returned - the return: its reason and the day the shop was told (`requestedAt`)
 * @param arrived - when the goods arrived and when the carrier's proof of sending is dated
 * @returns the stamp, or `undefined` when the law sets no deadline for this return
 */
export const refundDueFor = (
    returned: Pick<ReturnDocument, 'reason' | 'requestedAt'>,
    arrived: { receivedAt?: Date | undefined; proofOfSendingAt?: Date | undefined }
): ReturnRefundDue | undefined =>
    refundDueByOf({
        reason: returned.reason,
        // Counted on the shop's calendar: the refund is the shop's act (Regulation 1182/71 Art. 2(1)).
        withdrawalDueBy:
            returned.reason === 'withdrawal'
                ? withdrawalRefundDueBy(returned.requestedAt, shopTimezone())
                : undefined,
        ...arrived
    });
