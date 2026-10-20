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
 * | the expected date passes, no newer date   | (b)(1)(iii)(B), (b)(2)                 | ask, same as above               |
 *
 * 28 and not 30: two days for time zones and day counting. The same stricter-of-two-laws idea as
 * the withdrawal window.
 *
 * See: docs/modules/delivery.md#preorders-and-a-moved-date
 */

import { DAY_MS, endOfDayInZone } from '@domain-primitives/time';
import {
    FulfillmentConsent,
    FulfillmentHoldReason,
    FulfillmentOrderStatus,
    PreorderFulfillmentState
} from '@types';
import { remainingOf, remainingOfLine, type FulfillmentLine } from './fulfillment';

/** The longest first slip a buyer's silence may stand for: the FTC's 30 days, less a margin. */
export const SILENT_SLIP_DAYS = 28;

/**
 * How many days before the expected date the buyer is asked, if the goods are still not there. The
 * FTC wants the offer to go out "in no event later than" the promised time (435.2 (b)(1)): two days
 * for time zones and day counting, the same margin as the 28 of 30 above.
 */
export const ASK_BEFORE_DAYS = 2;

/**
 * How many days before the expected date a RENEWED question goes out: the buyer already accepted a
 * date once, and silence on this one cancels at that date (16 CFR 435.2 (b)(2)(ii)), so asking two
 * days ahead would leave them two days to answer. Two weeks is a fair window that still ends lawfully.
 */
export const RENEWED_ASK_BEFORE_DAYS = 14;

/** How long a buyer has to say "keep waiting" before silence cancels: the FTC's 30 days. */
export const CONSENT_WINDOW_DAYS = 30;

/** What a moved date asks of the buyer, decided by {@link judgeSlip}. */
export type SlipVerdict =
    /**
     * Not later than the date already expected, or nothing was expected and nothing is now: no
     * notice, the order page shows the new date.
     */
    | { kind: 'earlier' }
    /** A short first slip: tell the buyer and offer cancel; silence means they keep waiting. */
    | { kind: 'notify' }
    /** A long or repeated slip, or no date at all: ask, and silence means cancel. */
    | { kind: 'ask' };

/** What {@link judgeSlip} reads. */
export interface SlipFacts {
    /** The date promised when ordering; never moves. */
    agreedAt: Date;
    /** The date expected right now; absent once the date was cleared. */
    expectedAt?: Date | undefined;
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
    if (next === undefined) return expectedAt === undefined ? { kind: 'earlier' } : { kind: 'ask' };
    if (expectedAt === undefined || next.getTime() <= expectedAt.getTime())
        return { kind: 'earlier' };

    const slippedDays = (next.getTime() - agreedAt.getTime()) / DAY_MS;
    return slips === 0 && slippedDays <= SILENT_SLIP_DAYS ? { kind: 'notify' } : { kind: 'ask' };
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
    /** How many later dates the buyer was already told about. */
    slips: number;
}

/**
 * What a moved date asks of the buyer of one fulfillment order. The one rule the release-date
 * listener and the staff preview share, so the preview cannot drift from what the save does.
 *
 * @param facts - the fulfillment order
 * @param next - the date now expected, from {@link expectedDateOf}
 * @returns the verdict, or `undefined` when nothing was ever promised, so there is nothing to slip
 */
export const judgeMove = (facts: MoveFacts, next: Date | undefined): SlipVerdict | undefined =>
    facts.agreedAt === undefined
        ? undefined
        : judgeSlip({
              agreedAt: facts.agreedAt,
              expectedAt: facts.expectedAt,
              slips: facts.slips,
              next
          });

/** What {@link answerBy} reads off the fulfillment order as it stood BEFORE the question's own patch. */
export interface AnswerFacts {
    /** The date promised when ordering. */
    agreedAt?: Date | undefined;
    /** The date expected before this question; absent when the date was cleared. */
    expectedAt?: Date | undefined;
    /** Whether the buyer was asked, and what they answered. */
    consent?: FulfillmentConsent | undefined;
    /** The end of an open window, while `consent` is `awaiting`. */
    consentDeadline?: Date | undefined;
}

/**
 * The latest instant silence may be taken for a cancel, whatever the buyer was last told: the
 * seller must refund promptly, so a question never buys time past what the buyer was already owed
 * (16 CFR 435.2 (b)(1)(iii), (b)(2)(ii)). `undefined` when nothing bounds it.
 *
 * - an open window is never extended by asking again;
 * - once a dated delay was accepted, silence cancels at that date;
 * - before anything was accepted, at the promised date plus {@link SILENT_SLIP_DAYS};
 * - with no date expected there is nothing to be late for.
 * @param facts - the fulfillment order before the patch
 */
const answerCapOf = (facts: AnswerFacts): Date | undefined => {
    if (facts.consent === FulfillmentConsent.awaiting && facts.consentDeadline)
        return facts.consentDeadline;
    if (facts.expectedAt === undefined) return undefined;
    if (facts.consent === FulfillmentConsent.confirmed) return facts.expectedAt;
    return facts.agreedAt
        ? new Date(facts.agreedAt.getTime() + SILENT_SLIP_DAYS * DAY_MS)
        : undefined;
};

/**
 * When silence turns into a cancel, for a buyer asked at `now`: 30 days on, but never later than
 * what {@link answerCapOf} allows, to the end of that day on the SHOP's calendar: the day the mail
 * prints, so the printed day and the enforced day are one. A cap already past is held at today: the
 * buyer is never given a deadline that has gone.
 * @param now - the instant the buyer was asked
 * @param facts - the fulfillment order before this question changed it
 * @param timeZone - the shop's canonical IANA zone, the calendar the mail prints in
 */
export const answerBy = (now: Date, facts: AnswerFacts, timeZone: string): Date => {
    const latest = now.getTime() + CONSENT_WINDOW_DAYS * DAY_MS;
    const cap = answerCapOf(facts);
    return endOfDayInZone(
        new Date(cap ? Math.min(latest, Math.max(cap.getTime(), now.getTime())) : latest),
        timeZone
    );
};

/**
 * The most a question asked at `now` could give a buyer, for a preview that does not know which
 * fulfillment orders it would reach: 30 days, which {@link answerBy} only ever shortens.
 * @param now - the instant a question would be asked
 */
export const latestAnswerBy = (now: Date): Date =>
    new Date(now.getTime() + CONSENT_WINDOW_DAYS * DAY_MS);

/** What the daily sweep reads off a waiting fulfillment order. */
export interface SweepFacts {
    consent?: FulfillmentConsent | undefined;
    consentDeadline?: Date | undefined;
    expectedAt?: Date | undefined;
    lastNoticeAt?: Date | undefined;
}

/**
 * Is the expected date close (or past) with the buyer not told since? Keyed on the CURRENT expected
 * date: after an accepted slip the agreed date is long gone, and only the expected one can still be
 * missed. The first question goes out {@link ASK_BEFORE_DAYS} before it, because the offer must not
 * come later than the promise; a renewed one, after the buyer accepted a date,
 * {@link RENEWED_ASK_BEFORE_DAYS} before, so they have time to answer. A notice sent since then (or at the moment the date was moved) is what
 * stops a daily repeat.
 *
 * @param facts - the fulfillment order's dates and last notice
 * @param now - the instant of the sweep
 */
export const needsDueNotice = (facts: SweepFacts, now: Date): boolean => {
    if (facts.expectedAt === undefined || facts.consent === FulfillmentConsent.awaiting)
        return false;
    const aheadDays =
        facts.consent === FulfillmentConsent.confirmed ? RENEWED_ASK_BEFORE_DAYS : ASK_BEFORE_DAYS;
    const dueAt = facts.expectedAt.getTime() - aheadDays * DAY_MS;
    return (
        dueAt <= now.getTime() &&
        (facts.lastNoticeAt === undefined || facts.lastNoticeAt.getTime() < dueAt)
    );
};

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
