/**
 * @module
 * The right of withdrawal, as far as an order alone can answer it: when the window closes and
 * whether the button may show. Pure — Consumer Rights Directive Art. 9 and 11a, nothing else.
 *
 * The clock: for goods the period runs from delivery, for digital content and services from the
 * conclusion of the contract (Art. 9(2)). Before either has happened the right already exists and
 * the window has no end yet, which is why `withdrawUntil` is absent until then.
 */

import { DAY_MS } from '@domain-primitives/time';
import { OrderStatus, WithdrawBlockedReason } from '@types';
import type { FulfillmentSummary } from './fulfillment';
import { ORDER_STATUS_TRAITS } from './status-traits';
import { isDigitalOnlyOrder, type ShippableLineCandidate } from './rules';

/** What {@link isBeforeDispatch} reads off an order. */
export interface DispatchCandidate {
    status: OrderStatus;
    /** What `delivery` last reported; absent before the order's fulfillment orders exist. */
    fulfillment?: Pick<FulfillmentSummary, 'shipped'> | undefined;
}

/**
 * Whether a withdrawal, once made, is a cancel (nothing has left the shop) rather than a return
 * (goods are on their way, or arrived). Read off `fulfillment.shipped`, not `processing`: an order
 * that shipped in part is still `processing`, and refunding it whole would refund goods the buyer
 * already holds.
 * @param order - the order's status and its fulfilment summary
 */
export const isBeforeDispatch = (order: DispatchCandidate): boolean =>
    ORDER_STATUS_TRAITS[order.status].beforeDispatch && order.fulfillment?.shipped !== true;

/** What {@link canCorrectAddress} reads off an order. */
export interface AddressCandidate extends DispatchCandidate {
    /** Present only when a line ships to an address (not an all-digital order, not a pickup). */
    shippingAddress?: unknown;
}

/**
 * Whether staff may still correct where the order ships: it has an address, and nothing has left
 * yet. A parcel already on its way went where it went, and that is a carrier's problem, not an edit.
 * @param order - the order's status, fulfilment summary and address
 */
export const canCorrectAddress = (order: AddressCandidate): boolean =>
    Boolean(order.shippingAddress) && isBeforeDispatch(order);

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

/** The statutory guarantee of conformity, in years (Directive 2019/771 Art. 10(1), 2019/770 Art. 11(2)). */
const CONFORMITY_YEARS = 2;

/**
 * When the legal guarantee of conformity ends, counted from delivery: two calendar years, to the
 * end of the UTC day AFTER that date. The extra day is the margin the withdrawal window carries
 * too: a delivery marked between local midnight and the zone's UTC offset still gets its two
 * full years, and the guarantee cannot be waived downward (Directive 2019/771 Art. 21). A defect or a wrong item is the buyer's right until then, whatever the
 * shop's own (shorter) withdrawal period says — and made-to-order goods are covered too, since
 * Art. 16 CRD only takes the right of WITHDRAWAL away.
 * @param deliveredAt - when the goods arrived
 * @returns the last instant a defect or wrong item can still be reported
 */
export const conformityUntilFrom = (deliveredAt: Date): Date =>
    new Date(
        Date.UTC(
            deliveredAt.getUTCFullYear() + CONFORMITY_YEARS,
            deliveredAt.getUTCMonth(),
            deliveredAt.getUTCDate() + 2
        ) - 1
    );

/** What {@link withdrawalStartFor} reads off an order. */
export interface WithdrawalClockCandidate {
    items: readonly ShippableLineCandidate[];
    paidAt?: Date | null;
}

/**
 * The instant the withdrawal clock starts for an order arriving at `delivered`: payment for a
 * digital-only order (digital content, Art. 9(2)(c) — the contract's conclusion), the arrival
 * itself for goods (Art. 9(2)(b)). The one owner of that rule, so every door into `delivered`
 * counts the same way.
 * @param order - the order arriving
 * @param at - when it arrived
 * @returns the clock's start, to hand to {@link withdrawUntilFrom}
 */
export const withdrawalStartFor = (order: WithdrawalClockCandidate, at: Date): Date =>
    isDigitalOnlyOrder(order.items) ? (order.paidAt ?? at) : at;

/** The two deadlines frozen the moment an order is delivered. */
export interface DeliveryClock {
    /** The last instant a withdrawal is valid. */
    withdrawUntil: Date;
    /** The last instant a defect or wrong item can be reported. */
    conformityUntil: Date;
}

/**
 * Both deadlines for an order that arrived at `at`: the withdrawal period counted from its own
 * clock start, the guarantee from the arrival.
 * @param order - the order arriving
 * @param at - when it arrived
 * @param days - the withdrawal period in days
 */
export const deliveryClockFor = (
    order: WithdrawalClockCandidate,
    at: Date,
    days: number
): DeliveryClock => ({
    withdrawUntil: withdrawUntilFrom(withdrawalStartFor(order, at), days),
    conformityUntil: conformityUntilFrom(at)
});

/** The one fact about a line that decides whether the right of withdrawal reaches it. */
export interface WithdrawableLine {
    product?: { noWithdrawal?: boolean | null } | null;
}

/**
 * Whether a line is one of the goods Art. 16(c)–(d) takes the right of withdrawal away from
 * (made to order or clearly personalised, perishable) — decided by the product, frozen on the line
 * at checkout.
 * @param line - an order line
 */
export const isExcludedFromWithdrawal = (line: WithdrawableLine): boolean =>
    line.product?.noWithdrawal === true;

/** What {@link withdrawalRefusalOf} and {@link canWithdraw} need to know about an order. */
export interface WithdrawalCandidate {
    status: OrderStatus;
    /** The lines; when given, an order made only of excluded goods offers no withdrawal. */
    items?: readonly WithdrawableLine[];
    /** Frozen when the clock started; absent while it has not. */
    withdrawUntil?: Date;
    /** What `returns` last stamped; `returned` means every unit is already back. */
    returnStatus?: string | null | undefined;
}

/**
 * The first reason a withdrawal is refused on an order that is otherwise in a withdrawable status,
 * or `undefined` when it is open. The one answer the button (`OrderActions.withdrawBlocked`) and
 * the door (`POST /returns`) both read, so they cannot disagree:
 *
 * | Reason | When |
 * | --- | --- |
 * | `all_excluded` | every line is goods Art. 16 takes the right away from |
 * | `window_closed` | the frozen period ended |
 * | `nothing_left` | every unit is already back with the shop |
 *
 * A status that offers no withdrawal (cancelled) has no reason: there is no button to explain.
 * @param order - the order's status, lines, frozen deadline and return status
 * @param now - the moment being asked about
 */
export const withdrawalRefusalOf = (
    order: WithdrawalCandidate,
    now: Date
): WithdrawBlockedReason | undefined => {
    if (!ORDER_STATUS_TRAITS[order.status].withdrawable) return undefined;
    if (order.items?.every((line) => isExcludedFromWithdrawal(line)))
        return WithdrawBlockedReason.all_excluded;
    if (order.withdrawUntil !== undefined && now.getTime() > order.withdrawUntil.getTime())
        return WithdrawBlockedReason.window_closed;
    return order.returnStatus === 'returned' ? WithdrawBlockedReason.nothing_left : undefined;
};

/**
 * Whether the withdrawal button is offered: the order is in a withdrawable status and nothing
 * refuses it ({@link withdrawalRefusalOf}).
 * @param order - the order's status, lines, frozen deadline and return status
 * @param now - the moment being asked about
 */
export const canWithdraw = (order: WithdrawalCandidate, now: Date): boolean =>
    ORDER_STATUS_TRAITS[order.status].withdrawable && withdrawalRefusalOf(order, now) === undefined;
