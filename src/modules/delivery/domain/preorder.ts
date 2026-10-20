/**
 * @module
 * The rules for a preorder whose date slips (PRODUCT_STATES P5). Pure: a clock comes in as an
 * argument, so every case is testable without waiting.
 *
 * The law, and our margin:
 *
 * | Case                                      | Law                                    | What we do                              |
 * | ----------------------------------------- | -------------------------------------- | --------------------------------------- |
 * | first slip, at most 28 days past agreed   | FTC 16 CFR 435.2 (b)(1)(ii): 30 days   | notice, silence keeps waiting           |
 * | a longer slip, or any second one          | (b)(1)(iii), (b)(2)(ii): silence = no  | ask, silence cancels 28 days past agreed |
 * | the expected date passes, no newer date   | (b)(1)(iii)(B), (b)(2)                 | ask, same as above                      |
 * | a later date after an open-ended "yes"    | (b)(2)(iii): no more notices required  | notice only, the right to cancel stays  |
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

/**
 * The window {@link answerBy} falls back to when nothing bounds a question (no date promised, none
 * offered): the FTC's 30 days. Unreachable for a preorder, which always carries its promised date.
 */
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
    /** Whether the buyer was asked, and what they answered. */
    consent?: FulfillmentConsent | undefined;
    /** The definite revised date on record; absent with `consent: confirmed` is an open-ended yes. */
    revisedShipDate?: Date | undefined;
}

/**
 * Did the buyer agree to wait with no end date? A "yes" to a question that offered no date: the FTC
 * wants no further delay notices for it (16 CFR 435.2 (b)(2)(iii)); the right to cancel before
 * shipment stays.
 * @param facts - the fulfillment order's consent and revised date
 */
export const isOpenEndedYes = (facts: Pick<SlipFacts, 'consent' | 'revisedShipDate'>): boolean =>
    facts.consent === FulfillmentConsent.confirmed && facts.revisedShipDate === undefined;

/**
 * What a moved release date asks of the buyer.
 *
 * @param facts - the promise, the current expectation, the slips so far and the new date
 */
export const judgeSlip = (facts: SlipFacts): SlipVerdict => {
    const { agreedAt, expectedAt, slips, next } = facts;
    if (isOpenEndedYes(facts)) {
        // Told, never asked: no deadline, the buyer can cancel any time before it ships. A date
        // that is later, or the first one at all, is news; anything else is followed quietly.
        return next !== undefined &&
            (expectedAt === undefined || next.getTime() > expectedAt.getTime())
            ? { kind: 'notify' }
            : { kind: 'earlier' };
    }
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
    /** Whether the buyer was asked, and what they answered. */
    consent?: FulfillmentConsent | undefined;
    /** The definite revised date on record; absent with `consent: confirmed` is an open-ended yes. */
    revisedShipDate?: Date | undefined;
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
              consent: facts.consent,
              revisedShipDate: facts.revisedShipDate,
              next
          });

/** What {@link answerBy} reads off the fulfillment order as it stood BEFORE the question's own patch. */
export interface AnswerFacts {
    /** The date promised when ordering. */
    agreedAt?: Date | undefined;
    /** Whether the buyer was asked, and what they answered. */
    consent?: FulfillmentConsent | undefined;
    /** The end of an open window, while `consent` is `awaiting`. */
    consentDeadline?: Date | undefined;
    /** The definite revised date the buyer was offered or accepted; see the model. */
    revisedShipDate?: Date | undefined;
}

/**
 * The latest instant silence may be taken for a cancel, whatever the buyer was last told: the
 * seller must refund promptly, so a question never buys time past what the buyer was already owed
 * (16 CFR 435.2 (b)(1)(iii), (b)(2)(ii)). First that applies:
 *
 * - an open window is never extended by asking again;
 * - a definite date offered or accepted: silence cancels at the end of that date's day;
 * - otherwise the promised date plus {@link SILENT_SLIP_DAYS} calendar days, with or without a date
 *   expected now: the rule's own end, not a count from the day the buyer happens to be asked;
 * - with nothing promised, {@link CONSENT_WINDOW_DAYS} from the question (unreachable for a preorder).
 * @param now - the instant the buyer is asked
 * @param facts - the fulfillment order before the patch
 * @param timeZone - the shop's canonical IANA zone
 */
const answerCapOf = (now: Date, facts: AnswerFacts, timeZone: string): Date => {
    if (facts.consent === FulfillmentConsent.awaiting && facts.consentDeadline)
        return facts.consentDeadline;
    if (facts.revisedShipDate) return endOfDayInZone(facts.revisedShipDate, timeZone);
    return facts.agreedAt
        ? endOfDayInZone(facts.agreedAt, timeZone, SILENT_SLIP_DAYS)
        : endOfDayInZone(now, timeZone, CONSENT_WINDOW_DAYS);
};

/**
 * When silence turns into a cancel, for a buyer asked at `now`: where {@link answerCapOf} puts it,
 * to the end of that day on the SHOP's calendar: the day the mail prints, so the printed day and
 * the enforced day are one. A cap already past is held at today: the buyer is never given a
 * deadline that has gone.
 * @param now - the instant the buyer was asked
 * @param facts - the fulfillment order before this question changed it
 * @param timeZone - the shop's canonical IANA zone, the calendar the mail prints in
 */
export const answerBy = (now: Date, facts: AnswerFacts, timeZone: string): Date =>
    endOfDayInZone(
        new Date(Math.max(answerCapOf(now, facts, timeZone).getTime(), now.getTime())),
        timeZone
    );

/** What the daily sweep reads off a waiting fulfillment order. */
export interface SweepFacts {
    consent?: FulfillmentConsent | undefined;
    consentDeadline?: Date | undefined;
    revisedShipDate?: Date | undefined;
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
    // An open-ended yes is never asked again (16 CFR 435.2 (b)(2)(iii)).
    if (
        facts.expectedAt === undefined ||
        facts.consent === FulfillmentConsent.awaiting ||
        isOpenEndedYes(facts)
    )
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
