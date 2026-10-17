/**
 * @module
 * The daily sweep over waiting preorders (PRODUCT_STATES P5). Two jobs, one pass:
 *
 * - a fulfillment order whose CURRENT expected date has passed with no stock and no notice since
 *   gets the same question a long slip does: keep waiting, or cancel (an indefinite delay,
 *   FTC 16 CFR 435.2 (b)(1)(iii)(B));
 * - one whose buyer was asked and let the 30 days pass in silence is marked `expired` and
 *   announced, and `returns` cancels and refunds it. It is announced again each day until the
 *   cancel lands.
 *
 * Only fulfillment orders still `on_hold` for stock are looked at. Goods already allocated but not
 * shipped are a short delay, not an indefinite one, and the buyer can already cancel any time
 * before dispatch: they show in the admin's Late view instead (ADMIN_SALES A5.3).
 *
 * Repeating is harmless: a date that was noticed is not noticed again, and an expired wait is
 * announced again until its cancel lands, which `returns` treats as idempotent.
 *
 * See: docs/modules/delivery.md#the-daily-sweep
 */

import { FulfillmentConsent, FulfillmentHoldReason, FulfillmentOrderStatus } from '@types';
import { hasWaitExpired, needsDatePassedNotice } from '../domain';
import { fulfillmentOrderRepository } from '../repository';
import { announceWaitExpired } from './announce';
import { runAct } from './act';
import { recordNotice, type SentNotice } from './notice';

/** What one sweep did. */
export interface PreorderSweepResult {
    /** Buyers asked because an expected date passed. */
    asked: number;
    /** Fulfillment orders announced as expired. */
    expired: number;
}

/**
 * Ask the buyer of one fulfillment order whose date passed, in a transaction. Re-read there, so a
 * notice another run (or an allocation) already settled is not sent twice.
 *
 * @param fulfillmentOrderId - the fulfillment order
 * @param now - the instant of the sweep
 * @returns what to mail after the commit, if anything
 */
const askOne = (fulfillmentOrderId: string, now: Date): Promise<SentNotice | undefined> =>
    runAct(async (session) => {
        const fulfillmentOrder = await fulfillmentOrderRepository.findInSession(
            fulfillmentOrderId,
            session
        );
        if (
            fulfillmentOrder?.status !== FulfillmentOrderStatus.on_hold ||
            fulfillmentOrder.holdReason !== FulfillmentHoldReason.awaiting_stock ||
            !needsDatePassedNotice(fulfillmentOrder, now)
        )
            return undefined;

        return recordNotice(
            fulfillmentOrder,
            { reason: 'passed', needsAnswer: true, countsAsSlip: false },
            now,
            session
        );
    }).then((result) => (result.refused ? undefined : result.value));

/**
 * Mark one expired wait and announce it, in a transaction of its own so each lands or none does. A
 * wait already marked is announced again without a write: its cancel has not landed yet.
 *
 * @param fulfillmentOrderId - the fulfillment order
 * @param now - the instant of the sweep
 */
const expireOne = (fulfillmentOrderId: string, now: Date): Promise<boolean> =>
    runAct(async (session) => {
        const fulfillmentOrder = await fulfillmentOrderRepository.findInSession(
            fulfillmentOrderId,
            session
        );
        if (!fulfillmentOrder || !hasWaitExpired(fulfillmentOrder, now)) return false;

        // Closing the window is a fact worth keeping: from here a late "keep waiting" is refused, and
        // the cancel knows why it is being made.
        const marked =
            fulfillmentOrder.consent === FulfillmentConsent.expired
                ? fulfillmentOrder
                : await fulfillmentOrderRepository.claim(
                      fulfillmentOrderId,
                      fulfillmentOrder.revision,
                      { consent: FulfillmentConsent.expired },
                      session
                  );
        if (!marked) return false;
        await announceWaitExpired(marked, session);
        return true;
    }).then((result) => !result.refused && result.value);

/**
 * Run the daily preorder sweep.
 *
 * @param now - the instant of the sweep; tests pass their own
 * @returns how many buyers were asked and how many waits were announced as expired
 */
export const runPreorderSweep = async (now: Date = new Date()): Promise<PreorderSweepResult> => {
    const result: PreorderSweepResult = { asked: 0, expired: 0 };

    // One after another: each is a transaction over its own fulfillment order, and the buyer's mail
    // rides each commit's event.
    for (const fulfillmentOrder of await fulfillmentOrderRepository.findDatePassed(now)) {
        const sent = await askOne(String(fulfillmentOrder._id), now);
        if (sent) result.asked += 1;
    }

    for (const fulfillmentOrder of await fulfillmentOrderRepository.findWaitsExpired(now))
        if (await expireOne(String(fulfillmentOrder._id), now)) result.expired += 1;

    return result;
};
