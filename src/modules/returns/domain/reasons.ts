/**
 * @module
 * Which reasons a buyer can still give, judged by the two deadlines the order froze at delivery.
 * Pure — Consumer Rights Directive Art. 9/16 and the guarantee of conformity (Directive 2019/771
 * Art. 10), nothing else.
 *
 * See: docs/modules/returns.md#the-two-deadlines
 */

import { ReturnReason } from '@types';

/**
 * Reasons that ride the shop's withdrawal period (30 days by default), and with it the Art. 16
 * exclusion: `other` is a goodwill return on top of the right, not a legal one.
 */
export const WITHDRAWAL_WINDOW_REASONS: readonly ReturnReason[] = [
    ReturnReason.withdrawal,
    ReturnReason.other
];

/**
 * Reasons that are the legal guarantee of conformity: they last two years from delivery, and
 * reach made-to-order goods too, since Art. 16 only takes the right of WITHDRAWAL away.
 */
export const CONFORMITY_REASONS: readonly ReturnReason[] = [
    ReturnReason.defective,
    ReturnReason.wrong_item
];

/** What {@link reasonsOpenAt} reads off an order: the deadlines it froze at delivery. */
export interface FrozenDeadlines {
    /** Absent while the withdrawal clock has not started. */
    withdrawUntil?: Date | undefined;
    /** Absent while the order has not been delivered. */
    conformityUntil?: Date | undefined;
}

/**
 * Whether a frozen deadline still lets a reason in. A deadline that is absent has not started
 * counting, so the right is still open.
 * @param deadline - the frozen instant, if any
 * @param now - the moment being asked about
 */
const isOpen = (deadline: Date | undefined, now: Date): boolean =>
    deadline === undefined || now.getTime() <= deadline.getTime();

/**
 * The reasons a request may still name, in contract order.
 * @param order - the deadlines the order froze
 * @param now - the moment being asked about
 * @returns an empty list once both deadlines have passed
 */
export const reasonsOpenAt = (order: FrozenDeadlines, now: Date): ReturnReason[] => [
    ...(isOpen(order.withdrawUntil, now) ? [ReturnReason.withdrawal] : []),
    ...(isOpen(order.conformityUntil, now) ? CONFORMITY_REASONS : []),
    ...(isOpen(order.withdrawUntil, now) ? [ReturnReason.other] : [])
];

/**
 * Whether a reason is the legal guarantee (a defect or a wrong item) rather than the withdrawal
 * period's.
 * @param reason - the reason on a request
 */
export const isGuaranteeReason = (reason: ReturnReason): boolean =>
    CONFORMITY_REASONS.includes(reason);

/**
 * Whether a request may still name this reason.
 * @param order - the deadlines the order froze
 * @param reason - the reason on a request
 * @param now - the moment being asked about
 */
export const isReasonOpen = (order: FrozenDeadlines, reason: ReturnReason, now: Date): boolean =>
    reasonsOpenAt(order, now).includes(reason);
