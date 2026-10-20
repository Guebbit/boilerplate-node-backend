/**
 * @module
 * The daily sweep over waiting preorders (PRODUCT_STATES P5). One job: a fulfillment order whose
 * CURRENT expected date has passed with the goods still not here, and no notice since, tells its
 * buyer once that the date came and went and there is no new one. The email asks nothing and
 * cancels nothing: silence keeps the buyer waiting, they can cancel any time before it ships, and
 * staff see the late order on the board and decide whom to call.
 *
 * Only fulfillment orders still `on_hold` for stock are looked at. Goods already allocated but not
 * shipped are a short delay, not an indefinite one: they show in the admin's Late view instead
 * (ADMIN_SALES A5.3).
 *
 * Repeating is harmless: a date that was noticed is not noticed again.
 *
 * See: docs/modules/delivery.md#the-daily-sweep
 */

import { FulfillmentHoldReason, FulfillmentOrderStatus } from '@types';
import { needsDueNotice } from '../domain';
import { fulfillmentOrderRepository } from '../repository';
import { runAct } from './act';
import { recordNotice, type SentNotice } from './notice';

/** What one sweep did. */
export interface PreorderSweepResult {
    /** Buyers told that an expected date passed. */
    notified: number;
}

/**
 * Tell the buyer of one fulfillment order whose date passed, in a transaction. Re-read there, so a
 * notice another run (or an allocation) already settled is not sent twice.
 *
 * @param fulfillmentOrderId - the fulfillment order
 * @param now - the instant of the sweep
 * @returns what to mail after the commit, if anything
 */
const noticeOne = (fulfillmentOrderId: string, now: Date): Promise<SentNotice | undefined> =>
    runAct(async (session) => {
        const fulfillmentOrder = await fulfillmentOrderRepository.findInSession(
            fulfillmentOrderId,
            session
        );
        if (
            fulfillmentOrder?.status !== FulfillmentOrderStatus.on_hold ||
            fulfillmentOrder.holdReason !== FulfillmentHoldReason.awaiting_stock ||
            !needsDueNotice(fulfillmentOrder, now)
        )
            return undefined;

        return recordNotice(fulfillmentOrder, { reason: 'due' }, now, session);
    }).then((result) => (result.refused ? undefined : result.value));

/**
 * Run the daily preorder sweep.
 *
 * @param now - the instant of the sweep; tests pass their own
 * @returns how many buyers were told
 */
export const runPreorderSweep = async (now: Date = new Date()): Promise<PreorderSweepResult> => {
    let notified = 0;

    // One after another: each is a transaction over its own fulfillment order, and the buyer's mail
    // rides each commit's event.
    for (const fulfillmentOrder of await fulfillmentOrderRepository.findDatePassed(now)) {
        const sent = await noticeOne(String(fulfillmentOrder._id), now);
        if (sent) notified += 1;
    }

    return { notified };
};
