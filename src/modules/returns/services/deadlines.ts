/**
 * @module
 * The deadlines an order froze, as `returns` judges a reason against them.
 *
 * See: docs/modules/returns.md#the-two-deadlines
 */

import { withdrawalClosesAt } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import type { FrozenDeadlines } from '../domain';

/**
 * The order's two frozen deadlines, the withdrawal one moved to the instant it really closes: the
 * order stores the last day the buyer is told, and a withdrawal stays accepted one silent day past
 * it ({@link withdrawalClosesAt}).
 * @param order - the order the request is about
 * @returns what `reasonsOpenAt` and `isReasonOpen` read
 */
export const frozenDeadlinesOf = (
    order: Pick<OrderDocument, 'withdrawUntil' | 'conformityUntil'>
): FrozenDeadlines => ({
    withdrawUntil: order.withdrawUntil ? withdrawalClosesAt(order.withdrawUntil) : undefined,
    conformityUntil: order.conformityUntil
});
