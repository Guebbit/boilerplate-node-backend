/**
 * @module
 * A moved release date, as the buyers who already paid for it are affected (PRODUCT_STATES P5).
 * `products` announces `product.release_date_changed`; this is the listener. For every fulfillment
 * order still waiting for that product it works out the date now expected and decides what the buyer
 * is owed — the pure table is `../domain/preorder.ts`:
 *
 * | The new date is…                           | The buyer gets                                   |
 * | ------------------------------------------ | ------------------------------------------------ |
 * | not later than expected                    | nothing; the order page shows the date           |
 * | a first slip of at most 28 days            | a notice and the cancel option; silence waits    |
 * | longer, a second slip, or no date at all   | a question; 30 days of silence cancels           |
 *
 * Idempotent, since the outbox delivers at least once: a redelivery finds the date already expected
 * (or, for a cleared date, no expected date left) and does nothing.
 *
 * See: docs/modules/delivery.md#preorders-and-a-moved-date
 */

import { orderService } from '@modules/orders';
import { productService } from '@modules/products';
import { expectedDateOf, judgeMove } from '../domain';
import type { SlipVerdict } from '../domain';
import { fulfillmentOrderRepository } from '../repository';
import type { FulfillmentOrderDocument } from '../model';
import { runAct } from './act';
import { recordNotice, type SentNotice } from './notice';
import type { ClientSession } from 'mongoose';

/**
 * The date a fulfillment order is now expected, read from the catalogue, not from the event, so a
 * group that holds several products stays right when one of them moves earlier.
 *
 * @param fulfillmentOrder - the waiting fulfillment order
 * @returns the date, or `undefined` when it has none (see `expectedDateOf`)
 */
const expectedFrom = (fulfillmentOrder: FulfillmentOrderDocument): Promise<Date | undefined> =>
    productService
        .findManyByIds(fulfillmentOrder.lines.map(({ productId }) => productId))
        .then((products) =>
            expectedDateOf(
                fulfillmentOrder.lines,
                (id) => products.find((product) => String(product._id) === id)?.releaseDate
            )
        );

/**
 * Write the timeline's `release_date_moved`: the date this order's goods are now expected. Only
 * called when the move landed, so a redelivered event (which finds the date already followed)
 * writes no second row. `orders` cannot hear `products`' event itself: `products` is imported by
 * it, so delivery, which already judges every waiting order, is the one to narrate.
 *
 * @param fulfillmentOrder - the fulfillment order as read before the move
 * @param next - the date now expected, absent when the date was cleared
 * @param now - the instant of the move
 * @param session - the act's transaction
 */
const recordDateMoved = (
    fulfillmentOrder: FulfillmentOrderDocument,
    next: Date | undefined,
    now: Date,
    session: ClientSession
): Promise<void> =>
    orderService.appendTimeline(
        String(fulfillmentOrder.orderId),
        {
            type: 'release_date_moved',
            at: now,
            data: {
                fulfillmentOrderId: String(fulfillmentOrder._id),
                from: fulfillmentOrder.expectedAt?.toISOString() ?? null,
                to: next?.toISOString() ?? null
            }
        },
        session
    );

/**
 * Apply a verdict to one fulfillment order, in the act's transaction.
 *
 * @param fulfillmentOrder - the fulfillment order as read in `session`
 * @param verdict - what the buyer is owed
 * @param next - the date now expected
 * @param now - the instant of the move
 * @param session - the act's transaction
 */
const apply = async (
    fulfillmentOrder: FulfillmentOrderDocument,
    verdict: SlipVerdict,
    next: Date | undefined,
    now: Date,
    session: ClientSession
): Promise<SentNotice | undefined> => {
    if (verdict.kind === 'earlier') {
        // Quietly follow the date; the buyer is not told good news is a notice, and consent stays.
        if (next && next.getTime() !== fulfillmentOrder.expectedAt?.getTime()) {
            const claimed = await fulfillmentOrderRepository.claim(
                String(fulfillmentOrder._id),
                fulfillmentOrder.revision,
                { expectedAt: next },
                session
            );
            if (claimed) await recordDateMoved(fulfillmentOrder, next, now, session);
        }
        return undefined;
    }

    const sent = await recordNotice(
        fulfillmentOrder,
        {
            reason: 'moved',
            expectedAt: next ?? null,
            needsAnswer: verdict.kind === 'ask',
            countsAsSlip: true
        },
        now,
        session
    );
    // After the notice, stamped `now` so the row still sorts before the notice's own.
    if (sent) await recordDateMoved(fulfillmentOrder, next, now, session);
    return sent;
};

/**
 * Judge one waiting fulfillment order against its products' dates, in one transaction.
 *
 * @param fulfillmentOrderId - the fulfillment order
 * @returns what to mail after the commit, if anything
 */
const judgeOne = (fulfillmentOrderId: string): Promise<SentNotice | undefined> =>
    runAct(async (session) => {
        const fulfillmentOrder = await fulfillmentOrderRepository.findInSession(
            fulfillmentOrderId,
            session
        );
        if (!fulfillmentOrder) return undefined;

        const next = await expectedFrom(fulfillmentOrder);
        const verdict = judgeMove(fulfillmentOrder, next);
        return verdict && apply(fulfillmentOrder, verdict, next, new Date(), session);
    }).then((result) => (result.refused ? undefined : result.value));

/**
 * React to a release date that moved: tell the buyers it concerns what the law owes them.
 *
 * @param productId - the product whose date moved
 */
export const onReleaseDateChanged = async (productId: string): Promise<void> => {
    const waiting = await fulfillmentOrderRepository.findWaitingForProduct(productId);
    // One after another: each judgement is its own transaction over its own fulfillment order, and
    // the buyer's mail rides each commit's event.
    for (const fulfillmentOrder of waiting) await judgeOne(String(fulfillmentOrder._id));
};
