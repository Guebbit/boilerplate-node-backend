/**
 * @module
 * The rules for a preorder whose date slips (PRODUCT_STATES P5). Pure: a clock comes in as an
 * argument, so every case is testable without waiting.
 *
 * The shop tells, a person decides. It never asks the buyer anything and never cancels on its own:
 *
 * | The date…                                  | The buyer gets                                           |
 * | ------------------------------------------ | -------------------------------------------------------- |
 * | moves later, or is cleared                 | an email: the new date (or none yet), cancel for a full refund |
 * | moves earlier, or was cleared already      | nothing; the order page shows the date                   |
 * | passes with the goods still not here       | one email: still no stock, cancel any time               |
 *
 * Silence always means the buyer keeps waiting. The buyer can cancel any time before it ships, and
 * staff see the late orders on the board and decide whom to call.
 *
 * See: docs/modules/delivery.md#preorders-and-a-moved-date
 */

import { DAY_MS } from '@domain-primitives/time';
import { FulfillmentHoldReason, FulfillmentOrderStatus, PreorderFulfillmentState } from '@types';
import { remainingOf, remainingOfLine, type FulfillmentLine } from './fulfillment';

/** What a moved date owes the buyer, decided by {@link judgeSlip}. */
export type SlipVerdict =
    /**
     * Not later than the date already expected, or nothing was expected and nothing is now: no
     * email, the order page shows the new date.
     */
    | { kind: 'earlier' }
    /** Later, or no date at all: tell the buyer, who can cancel; silence means they keep waiting. */
    | { kind: 'notify' };

/** What {@link judgeSlip} reads. */
export interface SlipFacts {
    /** The date expected right now; absent once the date was cleared. */
    expectedAt?: Date | undefined;
    /** The date now expected; absent when the date was cleared, which is an indefinite delay. */
    next?: Date | undefined;
}

/**
 * What a moved release date owes the buyer: an email when it moves later or is cleared, nothing
 * when it moves earlier or there was no date to move.
 *
 * @param facts - the current expectation and the new date
 */
export const judgeSlip = ({ expectedAt, next }: SlipFacts): SlipVerdict => {
    if (next === undefined)
        return expectedAt === undefined ? { kind: 'earlier' } : { kind: 'notify' };
    return expectedAt === undefined || next.getTime() <= expectedAt.getTime()
        ? { kind: 'earlier' }
        : { kind: 'notify' };
};

/**
 * The date a fulfillment order is now expected: the latest date among the lines it still waits
 * for, since it leaves together.
 *
 * @param lines - the fulfillment order's lines; a line with nothing left is ignored
 * @param releaseDateOf - a product's release date as the catalogue holds it now
 * @returns the date, or `undefined` when any line still waiting has none (the group cannot leave
 *   before that product, so it has no date) or when nothing is left to wait for
 */
export const expectedDateOf = (
    lines: readonly FulfillmentLine[],
    releaseDateOf: (productId: string) => Date | undefined
): Date | undefined => {
    const dates = lines
        .filter((line) => remainingOfLine(line) > 0)
        .map(({ productId }) => releaseDateOf(productId));
    const known = dates.filter((date): date is Date => date !== undefined);
    return known.length === 0 || known.length < dates.length
        ? undefined
        : new Date(Math.max(...known.map((date) => date.getTime())));
};

/**
 * The date a WAITING fulfillment order is now expected. One rule for the listener and the staff
 * preview, so they cannot disagree. An order promised the 30-day default has no catalogue date to
 * follow, by design: it keeps the date it was promised and is left alone. Any other follows the
 * latest catalogue date among its lines ({@link expectedDateOf}).
 *
 * @param waiting - the fulfillment order: its lines, whether its promise was the default, and the
 *   date it is expected now
 * @param dateOf - a product's date as the catalogue holds it now (the one this order follows)
 * @returns the date, or `undefined` when it has none
 */
export const expectedDateOfWaiting = (
    waiting: {
        lines: readonly FulfillmentLine[];
        defaulted?: boolean | undefined;
        expectedAt?: Date | undefined;
    },
    dateOf: (productId: string) => Date | undefined
): Date | undefined =>
    waiting.defaulted === true ? waiting.expectedAt : expectedDateOf(waiting.lines, dateOf);

/** What {@link judgeMove} reads off a waiting fulfillment order. */
export interface MoveFacts {
    /** The date promised when ordering; absent on a fulfillment order that is not a preorder wait. */
    agreedAt?: Date | undefined;
    /** The date expected right now; absent once the date was cleared. */
    expectedAt?: Date | undefined;
}

/**
 * What a moved date owes the buyer of one fulfillment order. The one rule the release-date
 * listener and the staff preview share, so the preview cannot drift from what the save does.
 *
 * @param facts - the fulfillment order
 * @param next - the date now expected, from {@link expectedDateOf}
 * @returns the verdict, or `undefined` when nothing was ever promised, so there is nothing to slip
 */
export const judgeMove = (facts: MoveFacts, next: Date | undefined): SlipVerdict | undefined =>
    facts.agreedAt === undefined ? undefined : judgeSlip({ expectedAt: facts.expectedAt, next });

/** What the daily sweep reads off a waiting fulfillment order. */
export interface SweepFacts {
    expectedAt?: Date | undefined;
    lastNoticeAt?: Date | undefined;
}

/**
 * Has the expected date passed with the buyer not told since? The one email the sweep sends: the
 * date came and the goods did not. A notice sent after the date (or never needed one) stops a
 * daily repeat, and a date that moves later is a new date that can pass again.
 *
 * @param facts - the fulfillment order's expected date and last notice
 * @param now - the instant of the sweep
 */
export const needsDueNotice = (facts: SweepFacts, now: Date): boolean =>
    facts.expectedAt !== undefined &&
    facts.expectedAt.getTime() <= now.getTime() &&
    (facts.lastNoticeAt === undefined || facts.lastNoticeAt.getTime() < facts.expectedAt.getTime());

/**
 * The day gap between the date promised and the date expected, for a board column.
 *
 * @param agreedAt - the date promised when ordering
 * @param expectedAt - the date expected now
 * @returns whole days, never negative: an earlier date is not a slip
 */
export const slippedDays = (agreedAt: Date, expectedAt: Date): number =>
    Math.max(0, Math.round((expectedAt.getTime() - agreedAt.getTime()) / DAY_MS));

/** What the board's state and lateness read off a fulfillment order. */
export interface BoardFacts extends SweepFacts {
    status: FulfillmentOrderStatus;
    holdReason?: FulfillmentHoldReason | undefined;
    lines: readonly FulfillmentLine[];
}

/**
 * Where a preorder's fulfillment order stands, as the board names it. A staff hold on goods already
 * allocated is still `allocated`: the stock is set aside, someone is just holding it back.
 *
 * @param facts - the fulfillment order
 */
export const boardStateOf = (facts: BoardFacts): PreorderFulfillmentState => {
    if (facts.status === FulfillmentOrderStatus.cancelled)
        return PreorderFulfillmentState.cancelled;
    if (facts.status === FulfillmentOrderStatus.closed) return PreorderFulfillmentState.shipped;

    const awaitingStock =
        facts.status === FulfillmentOrderStatus.on_hold &&
        facts.holdReason === FulfillmentHoldReason.awaiting_stock;
    return awaitingStock ? PreorderFulfillmentState.waiting : PreorderFulfillmentState.allocated;
};

/**
 * Whether a fulfillment order is late: units remain and the date expected has passed, whether it
 * still waits for stock, has stock set aside and unshipped, or shipped in part. The Late view
 * (ADMIN_SALES A5): it is where goods already on the shelf show, which the sweep deliberately leaves
 * alone.
 *
 * @param facts - the fulfillment order
 * @param now - the instant to judge at
 */
export const isLate = (facts: BoardFacts, now: Date): boolean =>
    facts.expectedAt !== undefined &&
    facts.expectedAt.getTime() < now.getTime() &&
    facts.status !== FulfillmentOrderStatus.closed &&
    facts.status !== FulfillmentOrderStatus.cancelled &&
    remainingOf(facts.lines) > 0;
