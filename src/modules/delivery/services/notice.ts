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
import { buyerIdOf, orderService } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { FulfillmentConsent } from '@types';
import { answerBy } from '../domain';
import { fulfillmentOrderRepository } from '../repository';
import type { FulfillmentOrderPatch } from '../repository';
import type { FulfillmentOrderDocument } from '../model';
import type { FulfillmentOrderDelayed } from '../events';
import { announceDelayed } from './announce';

/** What a notice says, once the caller has decided it. */
export interface NoticeInput {
    /** `moved` for an admin's edit, `due` for the sweep. */
    reason: FulfillmentOrderDelayed['reason'];
    /** The date now expected; `null` removes it (the date was cleared), absent leaves it alone. */
    expectedAt?: Date | null | undefined;
    /** Whether silence cancels — the buyer must say "keep waiting". */
    needsAnswer: boolean;
    /** Whether this counts as a slip the buyer was told about (the sweep's `due` does not). */
    countsAsSlip: boolean;
}

/** What a recorded notice leaves for after the transaction: the fulfillment order it was written on. */
export interface SentNotice {
    fulfillmentOrder: FulfillmentOrderDocument;
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
    ...(buyerIdOf(order) ? { userId: buyerIdOf(order) } : {}),
    titles: fulfillmentOrder.lines.map(({ title }) => title),
    agreedAt: (fulfillmentOrder.agreedAt ?? new Date(0)).toISOString(),
    // What the buyer is told is the date NOW expected; a cleared date promises nothing new.
    ...(input.expectedAt ? { expectedAt: input.expectedAt.toISOString() } : {}),
    reason: input.reason,
    needsAnswer: input.needsAnswer,
    ...(deadline ? { answerBy: deadline.toISOString() } : {})
});

/**
 * Record a notice on a fulfillment order and announce it, inside the caller's transaction.
 *
 * A notice that needs an answer opens the window (`consent: awaiting`, deadline at most 30 days on); one
 * that does not leaves the consent alone. Both stamp `lastNoticeAt`, which is what stops the sweep
 * repeating itself. The write is conditional on the revision the caller read, so a ship or an
 * allocation racing it wins and the notice is simply not sent.
 *
 * @param fulfillmentOrder - the fulfillment order, as the caller read it in `session`
 * @param input - what the notice says
 * @param now - the instant of the notice
 * @param session - the caller's transaction
 * @returns what was announced, or `undefined` when the fulfillment order moved first
 */
export const recordNotice = async (
    fulfillmentOrder: FulfillmentOrderDocument,
    input: NoticeInput,
    now: Date,
    session: ClientSession
): Promise<SentNotice | undefined> => {
    const order = await orderService.readOrder(String(fulfillmentOrder.orderId), session);
    if (!order) return undefined;

    // `fulfillmentOrder` is still as it was before the patch: the cap reads the state the buyer was
    // last told, not the one this very notice writes.
    const deadline = input.needsAnswer ? answerBy(now, fulfillmentOrder) : undefined;
    const patch: FulfillmentOrderPatch = {
        lastNoticeAt: now,
        ...(input.expectedAt ? { expectedAt: input.expectedAt } : {}),
        // A cleared date leaves no `expectedAt`, so a redelivery finds nothing to move.
        ...(input.expectedAt === null ? { unset: ['expectedAt' as const] } : {}),
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
    return { fulfillmentOrder: claimed };
};
