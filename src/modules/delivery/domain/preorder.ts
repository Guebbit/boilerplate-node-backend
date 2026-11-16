/**
 * @module
 * The rules for a preorder whose date slips. Pure: a clock comes in as an
 * argument, so every case is testable without waiting.
 *
 * The shop tells, a person decides. It never asks the buyer anything and never cancels on its own:
 *
 * | The date…                                  | The buyer gets                                           |
 * | ------------------------------------------ | -------------------------------------------------------- |
 * | moves later, or is cleared                 | an email: the new date (or none yet), cancel for a full refund |
 * | moves earlier, or was cleared already      | nothing; the order page shows the date                   |
 * | is a day away or gone, goods not here      | one email: it will miss the date, cancel any time        |
 *
 * Silence always means the buyer keeps waiting. The buyer can cancel any time before it ships, and
 * staff see the late orders on the board and decide whom to call.
 *
 * @see docs/modules/delivery.md#preorders-and-a-moved-date
 */

import { DAY_MS, dayInZone } from '@domain-primitives/time';
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
    /** The shop's zone: the two dates are compared as days on its calendar. */
    timeZone: string;
}

/**
 * What a moved release date owes the buyer: an email when it moves later or is cleared, nothing
 * when it moves earlier, stays on the same shop day, or there was no date to move.
 *
 * @param facts - the current expectation, the new date and the shop's zone
 */
export const judgeSlip = ({ expectedAt, next, timeZone }: SlipFacts): SlipVerdict => {
    if (next === undefined)
        return expectedAt === undefined ? { kind: 'earlier' } : { kind: 'notify' };
    // Days, not instants: a promise is a day, so a move within the same day tells nobody.
    return expectedAt === undefined || dayInZone(next, timeZone) <= dayInZone(expectedAt, timeZone)
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
 * @param timeZone - the shop's zone
 * @returns the verdict, or `undefined` when nothing was ever promised, so there is nothing to slip
 */
export const judgeMove = (
    facts: MoveFacts,
    next: Date | undefined,
    timeZone: string
): SlipVerdict | undefined =>
    facts.agreedAt === undefined
        ? undefined
        : judgeSlip({ expectedAt: facts.expectedAt, next, timeZone });

/**
 * How far ahead of its expected date the sweep tells the buyer it will be missed. A daily sweep
 * must reach the buyer before the date, not the day after: the FTC mail-order rule counts from
 * the promised date.
 */
export const DUE_NOTICE_LEAD_MS = DAY_MS;

/** What the daily sweep reads off a waiting fulfillment order. */
export interface SweepFacts {
    expectedAt?: Date | undefined;
    /** The `expectedAt` the due notice was sent for; a different date is a new one to tell about. */
    dueNoticeFor?: Date | undefined;
}

/**
 * Will the expected date be missed, with the buyer not told for it yet? The one email the sweep
 * sends: the date is within a day (or already gone) and the goods are not here. A notice sent for
 * this very date stops a daily repeat, and a date that moves is a new date to tell about.
 *
 * @param facts - the fulfillment order's expected date and the date a notice was sent for
 * @param now - the instant of the sweep
 */
export const needsDueNotice = (facts: SweepFacts, now: Date): boolean =>
    facts.expectedAt !== undefined &&
    facts.expectedAt.getTime() <= now.getTime() + DUE_NOTICE_LEAD_MS &&
    facts.dueNoticeFor?.getTime() !== facts.expectedAt.getTime();

/**
 * The day gap between the day promised and the day expected, for a board column. Counted on the
 * shop's calendar, so the hour a promise happens to carry never rounds a day away.
 *
 * @param agreedAt - the date promised when ordering
 * @param expectedAt - the date expected now
 * @param timeZone - the shop's zone
 * @returns whole days, never negative: an earlier date is not a slip
 */
export const slippedDays = (agreedAt: Date, expectedAt: Date, timeZone: string): number => {
    // Each shop day read as UTC midnight: two whole-day instants, so the gap is an exact day count.
    const asUtcDay = (instant: Date): number => Date.parse(dayInZone(instant, timeZone));
    return Math.max(0, Math.round((asUtcDay(expectedAt) - asUtcDay(agreedAt)) / DAY_MS));
};

/**
 * The date the buyer holds after a notice (`promisedAt`): a later date replaces it, a cleared date
 * ("no date yet") removes it, and an earlier or unchanged date leaves it. It is what the next
 * slip is measured against for the staff's consent reminder.
 *
 * @param promisedAt - the date the buyer held before this notice, if any
 * @param expectedAt - the date the notice names; `null` clears it, absent leaves it alone
 * @returns the date to store, `null` to remove the stored one, `undefined` to leave it
 */
export const promisedAfterNotice = (
    promisedAt: Date | undefined,
    expectedAt: Date | null | undefined
): Date | null | undefined => {
    if (expectedAt === null) return promisedAt === undefined ? undefined : null;
    if (expectedAt === undefined) return undefined;
    return promisedAt === undefined || expectedAt.getTime() > promisedAt.getTime()
        ? expectedAt
        : undefined;
};

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
    if (facts.status === FulfillmentOrderStatus.canceled) return PreorderFulfillmentState.canceled;
    if (facts.status === FulfillmentOrderStatus.closed) return PreorderFulfillmentState.shipped;

    const awaitingStock =
        facts.status === FulfillmentOrderStatus.on_hold &&
        facts.holdReason === FulfillmentHoldReason.awaiting_stock;
    return awaitingStock ? PreorderFulfillmentState.waiting : PreorderFulfillmentState.allocated;
};

/**
 * Whether a fulfillment order is late: units remain and the date expected has passed, whether it
 * still waits for stock, has stock set aside and unshipped, or shipped in part. The Late view
 * is where goods already on the shelf show, which the sweep deliberately leaves
 * alone.
 *
 * @param facts - the fulfillment order
 * @param now - the instant to judge at
 */
export const isLate = (facts: BoardFacts, now: Date): boolean =>
    facts.expectedAt !== undefined &&
    facts.expectedAt.getTime() < now.getTime() &&
    facts.status !== FulfillmentOrderStatus.closed &&
    facts.status !== FulfillmentOrderStatus.canceled &&
    remainingOf(facts.lines) > 0;
