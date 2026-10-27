/**
 * @module
 * What each situation opens, as pure data: the kind, the record it is about, the words staff read
 * and the date it is due. A producer's event goes in; a ticket's first facts come out. The
 * dedup key, the route set and the write are other files' business.
 *
 * Texts are English and carry ids only, never a name or an address: they sit in the inbox of
 * every staff member who holds the set, and the linked record has the rest.
 */

import { TicketKind, TicketLinkType } from '@types';

const HOUR_MS = 3_600_000;

const DAY_MS = 24 * HOUR_MS;

/** How long a person has to look at an account flagged for review or a failed export. */
const REVIEW_WINDOW_MS = 72 * HOUR_MS;

/** How long a paid order without stock set aside may wait: the customer is already owed goods. */
const ORPHAN_WINDOW_MS = 4 * HOUR_MS;

/** FTC 16 CFR 435.2: a seller may delay up to 30 days past the promised date without consent. */
const FTC_GRACE_MS = 30 * DAY_MS;

/** The first facts of a system ticket. */
export interface SystemOpening {
    /** The situation. */
    kind: TicketKind;
    /** The record it is about. */
    link: { type: TicketLinkType; id: string };
    /** The account it is about, when there is one: the export and erasure follow it. */
    subjectId?: string;
    /** The inbox line. */
    subject: string;
    /** The ticket's body. */
    message: string;
    /** When it is overdue. */
    dueAt: Date;
}

/**
 * An account the shop's rule flagged for review.
 *
 * @param userId - the flagged account
 * @param now - the clock
 */
export const accountReviewOpening = (userId: string, now: Date): SystemOpening => ({
    kind: TicketKind.account_review,
    link: { type: TicketLinkType.user, id: userId },
    subjectId: userId,
    subject: 'Account flagged for review',
    message: `Account ${userId} cancelled paid orders over the limit. Review it: place a purchase hold, or lift the flag.`,
    dueAt: new Date(now.getTime() + REVIEW_WINDOW_MS)
});

/**
 * A refund of a hand-recorded payment: the money goes back outside the app.
 *
 * @param refund - the refund and what it belongs to
 * @param refund.refundId - the refund record
 * @param refund.orderId - the order it pays back
 * @param dueAt - when it is overdue
 */
export const refundOwedOpening = (
    refund: { refundId: string; orderId: string },
    dueAt: Date
): SystemOpening => ({
    kind: TicketKind.manual_refund_owed,
    link: { type: TicketLinkType.refund, id: refund.refundId },
    subject: 'Refund owed by hand',
    message: `Refund ${refund.refundId} on order ${refund.orderId} was paid by hand. Send the money back, then mark the refund returned.`,
    dueAt
});

/**
 * A provider success that is not the payment frozen for the order.
 *
 * @param payment - the payment and its order
 * @param payment.paymentId - the payment
 * @param payment.orderId - the order that was cancelled
 * @param dueAt - when it is overdue
 */
export const amountMismatchOpening = (
    payment: { paymentId: string; orderId: string },
    dueAt: Date
): SystemOpening => ({
    kind: TicketKind.amount_mismatch,
    link: { type: TicketLinkType.payment, id: payment.paymentId },
    subject: 'Payment amount mismatch',
    message: `The provider reported a success for order ${payment.orderId} that is not payment ${payment.paymentId}. The order was cancelled and the money is being returned. Find out why, then close this.`,
    dueAt
});

/**
 * An order paid with nothing set aside for it.
 *
 * @param orderId - the paid order
 * @param now - the clock
 */
export const paidWithoutHoldOpening = (orderId: string, now: Date): SystemOpening => ({
    kind: TicketKind.paid_without_hold,
    link: { type: TicketLinkType.order, id: orderId },
    subject: 'Paid order without stock set aside',
    message: `Order ${orderId} is paid but no units were set aside for it. Find stock or cancel and refund it.`,
    dueAt: new Date(now.getTime() + ORPHAN_WINDOW_MS)
});

/**
 * A data export that could not be built: the person is still owed their file.
 *
 * @param failure - the failed export
 * @param failure.userId - whose export it is
 * @param failure.exportId - the failed export
 * @param now - the clock
 */
export const exportFailedOpening = (
    failure: { userId: string; exportId: string },
    now: Date
): SystemOpening => ({
    kind: TicketKind.export_failed,
    link: { type: TicketLinkType.export, id: failure.exportId },
    subjectId: failure.userId,
    subject: 'Data export failed',
    message: `The data export of account ${failure.userId} failed. The person is owed their file within a month: ask them to request it again, or find out why it failed.`,
    dueAt: new Date(now.getTime() + REVIEW_WINDOW_MS)
});

/**
 * A refund the provider refused for good: the money has to go back another way.
 *
 * @param refund - the refund and what it belongs to
 * @param refund.refundId - the refund record
 * @param refund.orderId - the order it pays back
 * @param refund.failureReason - the closed code of the refusal
 * @param dueAt - when it is overdue
 */
export const refundRefusedOpening = (
    refund: { refundId: string; orderId: string; failureReason: string },
    dueAt: Date
): SystemOpening => ({
    kind: TicketKind.refund_refused,
    link: { type: TicketLinkType.refund, id: refund.refundId },
    subject: 'Refund refused by the provider',
    message: `Refund ${refund.refundId} on order ${refund.orderId} was refused for good (${refund.failureReason}). Return the money another way, then mark the refund returned or cancel it.`,
    dueAt
});

/**
 * A dispute the buyer's bank opened (or reopened) on a payment.
 *
 * @param dispute - the dispute as the provider last reported it
 * @param dispute.paymentId - the disputed payment
 * @param dispute.orderId - its order
 * @param dispute.kind - inquiry or chargeback
 * @param dispute.reason - the closed reason code
 * @param dispute.evidenceDueBy - the provider's deadline, an ISO instant, when it set one
 * @param fallbackDueAt - the date used when the provider set no deadline
 */
export const disputeOpening = (
    dispute: {
        paymentId: string;
        orderId: string;
        kind: string;
        reason: string;
        evidenceDueBy?: string | undefined;
    },
    fallbackDueAt: Date
): SystemOpening => ({
    kind: TicketKind.dispute,
    link: { type: TicketLinkType.payment, id: dispute.paymentId },
    subject: `Payment dispute (${dispute.kind})`,
    message: `The buyer's bank opened a ${dispute.kind} on payment ${dispute.paymentId} of order ${dispute.orderId} (${dispute.reason}). Send the evidence in the provider's dashboard before the deadline.`,
    dueAt: dispute.evidenceDueBy ? new Date(dispute.evidenceDueBy) : fallbackDueAt
});

/** What a delay notice says, as far as the consent reminder is concerned. */
export interface DelayFacts {
    fulfillmentOrderId: string;
    orderId: string;
    /** The date promised when ordering (ISO). */
    agreedAt: string;
    /** The date the buyer held before this notice (ISO); absent once told "no date yet". */
    promisedAt?: string | undefined;
    /** The date the notice names (ISO); absent when it names none. */
    expectedAt?: string | undefined;
    /** Where the order ships to. */
    shipCountry?: string | undefined;
}

/**
 * The reminder that a person must ask the buyer's consent to a delay (16 CFR 435.2(b)). The shop
 * never asks and never cancels: this is the note that someone must, and by when.
 *
 * | Before this notice                   | Opens when                              | Due                  |
 * | ------------------------------------ | --------------------------------------- | -------------------- |
 * | the buyer holds the date they ordered | no new date, or one past agreed + 30 d  | agreed + 30 d        |
 * | the buyer holds a later date          | no new date, or one past that date      | that date            |
 * | the buyer was told "no date yet"      | never: the earlier ticket stands        |                      |
 *
 * @param delay - the notice
 * @param ftcCountries - the ship-to countries the rule applies to
 * @returns what to open, or `undefined` when no consent is owed
 */
export const consentDueOpening = (
    delay: DelayFacts,
    ftcCountries: readonly string[]
): SystemOpening | undefined => {
    if (!delay.shipCountry || !ftcCountries.includes(delay.shipCountry)) return undefined;
    // Told "no date yet" earlier: the ticket that was opened then still stands.
    if (!delay.promisedAt) return undefined;

    const agreed = new Date(delay.agreedAt).getTime();
    const promised = new Date(delay.promisedAt).getTime();
    const held = promised > agreed ? promised : agreed + FTC_GRACE_MS;
    // A later date inside what the buyer already holds needs no new consent.
    if (delay.expectedAt && new Date(delay.expectedAt).getTime() <= held) return undefined;

    return {
        kind: TicketKind.consent_due,
        link: { type: TicketLinkType.fulfillment_order, id: delay.fulfillmentOrderId },
        subject: 'Delay: the buyer must be asked',
        message: `Order ${delay.orderId} will not ship by the date the buyer holds. Ask them whether they accept the delay; if they do not answer or refuse, cancel and refund by the due date (16 CFR 435.2).`,
        dueAt: new Date(held)
    };
};
