/**
 * @module
 * Telling a preorder's buyer that their date moved or passed — the one place the notice is built,
 * for the two things that start it: an admin moving the release date and the daily sweep finding a
 * date that passed. Both write the fulfillment order's new state and the event in one transaction;
 * the email follows the commit.
 *
 * See: docs/modules/delivery.md#preorders-and-a-moved-date
 */

import type { ClientSession } from 'mongoose';
import { orderService } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { FulfillmentConsent } from '@types';
import { answerBy } from '../domain';
import { fulfillmentOrderRepository } from '../repository';
import type { FulfillmentOrderPatch } from '../repository';
import type { FulfillmentOrderDocument } from '../model';
import type { FulfillmentOrderDelayed } from '../events';
import { announceDelayed } from './announce';
import { notifyDelayed } from './notify';

/** What a notice says, once the caller has decided it. */
export interface NoticeInput {
    /** `moved` for an admin's edit, `passed` for the sweep. */
    reason: FulfillmentOrderDelayed['reason'];
    /** The date now expected; absent when there is none. */
    expectedAt?: Date | undefined;
    /** Whether silence cancels — the buyer must say "keep waiting". */
    needsAnswer: boolean;
    /** Whether this counts as a slip the buyer was told about (the sweep's `passed` does not). */
    countsAsSlip: boolean;
}

/** What a committed notice leaves for after the transaction: the mail. */
export interface SentNotice {
    fulfillmentOrder: FulfillmentOrderDocument;
    order: OrderDocument;
    delayed: FulfillmentOrderDelayed;
}

/**
 * The event payload for one waiting fulfillment order.
 * @param fulfillmentOrder - the fulfillment order as it now stands
 * @param order - its order
 * @param input - what the notice says
 * @param deadline - when silence cancels, when the buyer must answer
 */
const payloadOf = (
    fulfillmentOrder: FulfillmentOrderDocument,
    order: OrderDocument,
    input: NoticeInput,
    deadline: Date | undefined
): FulfillmentOrderDelayed => ({
    orderId: String(fulfillmentOrder.orderId),
    fulfillmentOrderId: String(fulfillmentOrder._id),
    ...(order.userId ? { userId: String(order.userId) } : {}),
    titles: fulfillmentOrder.lines.map(({ title }) => title),
    agreedAt: (fulfillmentOrder.agreedAt ?? new Date(0)).toISOString(),
    // What the buyer is told is the date NOW expected; a cleared date leaves the stored one behind
    // but promises nothing new, so it is not in the notice.
    ...(input.expectedAt ? { expectedAt: input.expectedAt.toISOString() } : {}),
    reason: input.reason,
    needsAnswer: input.needsAnswer,
    ...(deadline ? { answerBy: deadline.toISOString() } : {})
});

/**
 * Record a notice on a fulfillment order and announce it, inside the caller's transaction.
 *
 * A notice that needs an answer opens the window (`consent: awaiting`, deadline 30 days on); one
 * that does not leaves the consent alone. Both stamp `lastNoticeAt`, which is what stops the sweep
 * repeating itself. The write is conditional on the revision the caller read, so a ship or an
 * allocation racing it wins and the notice is simply not sent.
 *
 * @param fulfillmentOrder - the fulfillment order, as the caller read it in `session`
 * @param input - what the notice says
 * @param now - the instant of the notice
 * @param session - the caller's transaction
 * @returns what to send after the commit, or `undefined` when the fulfillment order moved first
 */
export const recordNotice = async (
    fulfillmentOrder: FulfillmentOrderDocument,
    input: NoticeInput,
    now: Date,
    session: ClientSession
): Promise<SentNotice | undefined> => {
    const order = await orderService.readOrder(String(fulfillmentOrder.orderId), session);
    if (!order) return undefined;

    const deadline = input.needsAnswer ? answerBy(now) : undefined;
    const patch: FulfillmentOrderPatch = {
        lastNoticeAt: now,
        ...(input.expectedAt ? { expectedAt: input.expectedAt } : {}),
        ...(input.countsAsSlip ? { slips: fulfillmentOrder.slips + 1 } : {}),
        ...(input.needsAnswer
            ? {
                  consent: FulfillmentConsent.awaiting,
                  ...(deadline ? { consentDeadline: deadline } : {})
              }
            : {})
    };
    const claimed = await fulfillmentOrderRepository.claim(
        String(fulfillmentOrder._id),
        fulfillmentOrder.revision,
        patch,
        session
    );
    if (!claimed) return undefined;

    const delayed = payloadOf(claimed, order, input, deadline);
    await announceDelayed(delayed, session);
    return { fulfillmentOrder: claimed, order, delayed };
};

/**
 * After the commit: mail the buyer what the notice said. A mail that fails never undoes the notice.
 * @param sent - what {@link recordNotice} returned
 */
export const mailNotice = (sent: SentNotice | undefined): Promise<void> =>
    sent ? notifyDelayed(sent.order, sent.delayed) : Promise.resolve();
