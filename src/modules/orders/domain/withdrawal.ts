/**
 * @module
 * The right of withdrawal, as far as an order alone can answer it: when the window closes and
 * whether the button may show. Pure — Consumer Rights Directive Art. 9 and 11a, nothing else.
 *
 * The clock: for goods the period runs from delivery, for digital content and services from the
 * conclusion of the contract (Art. 9(2)). Before either has happened the right already exists and
 * the window has no end yet, which is why `withdrawUntil` is absent until then.
 */

import { OrderStatus } from '@types';

/** One day, in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The statuses a withdrawal may be made from: the contract is concluded and the order has not been
 * cancelled. `pending` counts — the consumer's right does not wait for their own payment.
 */
const WITHDRAWABLE_STATUSES: ReadonlySet<OrderStatus> = new Set([
    OrderStatus.pending,
    OrderStatus.paid,
    OrderStatus.processing,
    OrderStatus.shipped,
    OrderStatus.delivered
]);

/**
 * Whether a withdrawal, once made, is a cancel (nothing has left the shop) rather than a return
 * (goods are on their way, or arrived). Everything before `shipped` is a cancel.
 * @param status - the order's current status
 */
export const isBeforeDispatch = (status: OrderStatus): boolean =>
    status === OrderStatus.pending ||
    status === OrderStatus.paid ||
    status === OrderStatus.processing;

/**
 * When the withdrawal window closes, counted from the moment its clock starts.
 *
 * Calendar days, as CRD recital 41 → Regulation 1182/71 Art. 3(1) and 3(2)(c) count them:
 *
 * - the day the event happens is not counted;
 * - the period ends with the last hour of its last day, not `days × 24 h` after the event.
 *
 * Days are UTC days. Weekend and public-holiday roll-over (Art. 3(4)) is not computed: the
 * period's minimum (`orders/config.ts`) always outlasts it.
 * See docs/modules/orders.md#the-withdrawal-window
 *
 * @param start - delivery for goods, or the conclusion of the contract for digital content
 * @param days - the withdrawal period (14 by law, 21 at least here, 30 by default)
 * @returns the last instant a withdrawal is still valid
 */
export const withdrawUntilFrom = (start: Date, days: number): Date => {
    const startOfEventDay = Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth(),
        start.getUTCDate()
    );
    return new Date(startOfEventDay + (days + 1) * DAY_MS - 1);
};

/** The one fact about a line that decides whether the right of withdrawal reaches it. */
export interface WithdrawableLine {
    product?: { noWithdrawal?: boolean | null } | null;
}

/**
 * Whether a line is one of the goods Art. 16 takes the right of withdrawal away from (personalised,
 * sealed hygiene, perishable...) — decided by the product, frozen on the line at checkout.
 * @param line - an order line
 */
export const isExcludedFromWithdrawal = (line: WithdrawableLine): boolean =>
    line.product?.noWithdrawal === true;

/** What {@link canWithdraw} needs to know about an order. */
export interface WithdrawalCandidate {
    status: OrderStatus;
    /** The lines; when given, an order made only of excluded goods offers no withdrawal. */
    items?: readonly WithdrawableLine[];
    /** Frozen when the clock started; absent while it has not. */
    withdrawUntil?: Date;
}

/**
 * Whether the withdrawal button is offered: the order is in a withdrawable status and the window,
 * if it has started, is still open.
 * @param order - the order's status and its frozen deadline
 * @param now - the moment being asked about
 */
export const canWithdraw = (order: WithdrawalCandidate, now: Date): boolean =>
    WITHDRAWABLE_STATUSES.has(order.status) &&
    (order.items === undefined || order.items.some((line) => !isExcludedFromWithdrawal(line))) &&
    (order.withdrawUntil === undefined || now.getTime() <= order.withdrawUntil.getTime());
