/**
 * @module
 * The rules for a preorder whose date slips (PRODUCT_STATES P5). Pure: a clock comes in as an
 * argument, so every case is testable without waiting.
 *
 * The law, and our margin:
 *
 * | Case                                      | Law                                    | What we do                       |
 * | ----------------------------------------- | -------------------------------------- | -------------------------------- |
 * | first slip, at most 28 days past agreed   | FTC 16 CFR 435.2 (b)(1)(ii): 30 days   | notice, silence keeps waiting    |
 * | a longer slip, or any second one          | (b)(1)(iii), (b)(2)(ii): silence = no  | ask, silence for 30 days cancels |
 * | the expected date passes, no newer date   | (b)(1)(iii)(B), CRD Art. 18            | ask, same as above               |
 *
 * 28 and not 30: two days for time zones and day counting. The same stricter-of-two-laws idea as
 * the withdrawal window.
 *
 * See: docs/modules/delivery.md#preorders-and-a-moved-date
 */

import {
    FulfillmentConsent,
    FulfillmentHoldReason,
    FulfillmentOrderStatus,
    PreorderFulfillmentState
} from '@types';
import { remainingOf, type FulfillmentLine } from './fulfillment';

/** Milliseconds in a day; every date rule here counts whole UTC days. */
const DAY_MS = 86_400_000;

/** The longest first slip a buyer's silence may stand for: the FTC's 30 days, less a margin. */
export const SILENT_SLIP_DAYS = 28;

/** How long a buyer has to say "keep waiting" before silence cancels: the FTC's 30 days. */
export const CONSENT_WINDOW_DAYS = 30;

/** What a moved date asks of the buyer, decided by {@link judgeSlip}. */
export type SlipVerdict =
    /** Not later than the date already expected: no notice, the order page shows the new date. */
    | { kind: 'earlier' }
    /** A short first slip: tell the buyer and offer cancel; silence means they keep waiting. */
    | { kind: 'notify' }
    /** A long or repeated slip, or no date at all: ask, and silence means cancel. */
    | { kind: 'ask' };

/** What {@link judgeSlip} reads. */
export interface SlipFacts {
    /** The date promised when ordering; never moves. */
    agreedAt: Date;
    /** The date expected right now. */
    expectedAt: Date;
    /** How many later dates the buyer was already told about. */
    slips: number;
    /** The date now expected; absent when the date was cleared, which is an indefinite delay. */
    next?: Date | undefined;
}

/**
 * What a moved release date asks of the buyer.
 *
 * @param facts - the promise, the current expectation, the slips so far and the new date
 */
export const judgeSlip = ({ agreedAt, expectedAt, slips, next }: SlipFacts): SlipVerdict => {
    if (next === undefined) return { kind: 'ask' };
    if (next.getTime() <= expectedAt.getTime()) return { kind: 'earlier' };

    const slippedDays = (next.getTime() - agreedAt.getTime()) / DAY_MS;
    return slips === 0 && slippedDays <= SILENT_SLIP_DAYS ? { kind: 'notify' } : { kind: 'ask' };
};

/**
 * When silence turns into a cancel, for a buyer asked at `now`.
 * @param now - the instant the buyer was asked
 */
export const answerBy = (now: Date): Date => new Date(now.getTime() + CONSENT_WINDOW_DAYS * DAY_MS);

/** What the daily sweep reads off a waiting fulfillment order. */
export interface SweepFacts {
    consent?: FulfillmentConsent | undefined;
    consentDeadline?: Date | undefined;
    expectedAt?: Date | undefined;
    lastNoticeAt?: Date | undefined;
}

/**
 * Has the expected date passed with the buyer never told? Keyed on the CURRENT expected date: after
 * an accepted slip the agreed date is long gone, and only the expected one can still be missed. A
 * notice sent since it passed (or at the moment it was moved) is what stops a daily repeat.
 *
 * @param facts - the fulfillment order's dates and last notice
 * @param now - the instant of the sweep
 */
export const needsDatePassedNotice = (facts: SweepFacts, now: Date): boolean =>
    facts.expectedAt !== undefined &&
    facts.expectedAt.getTime() <= now.getTime() &&
    facts.consent !== FulfillmentConsent.awaiting &&
    (facts.lastNoticeAt === undefined || facts.lastNoticeAt.getTime() < facts.expectedAt.getTime());

/**
 * Has the buyer been asked and let the window close in silence? Either the sweep already said so
 * (`expired`, which stays true until the cancel lands), or the deadline has passed.
 *
 * @param facts - the fulfillment order's consent state and deadline
 * @param now - the instant of the sweep
 */
export const hasWaitExpired = (facts: SweepFacts, now: Date): boolean =>
    facts.consent === FulfillmentConsent.expired ||
    (facts.consent === FulfillmentConsent.awaiting &&
        facts.consentDeadline !== undefined &&
        facts.consentDeadline.getTime() <= now.getTime());

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
 * Whether the buyer has been asked and the answer is outstanding or the window already closed.
 * @param facts - the fulfillment order's consent state
 */
const isBeingAsked = (facts: Pick<SweepFacts, 'consent'>): boolean =>
    facts.consent === FulfillmentConsent.awaiting || facts.consent === FulfillmentConsent.expired;

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
    if (!awaitingStock) return PreorderFulfillmentState.allocated;
    return isBeingAsked(facts)
        ? PreorderFulfillmentState.awaiting_yes
        : PreorderFulfillmentState.waiting;
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
