/**
 * @module
 * What each shop situation opens, as pure data: the kind, the record it is about, the set that
 * works it, the words staff read and the date it is due. A payment, stock or delivery event goes
 * in; a task's first facts come out ({@link ShopOpening}). The dedup key and the
 * write are `tasks`' business.
 *
 * Texts are English and carry ids only, never a name or an address: they sit in the inbox of
 * every staff member who holds the set, and the linked record has the rest.
 */

import { RefundDueRule, RefundFailureReason, TaskKind, TaskLinkType } from '@types';
import type { PermissionSetName } from '@api/permission-vocabulary';
import { DAY_MS, HOUR_MS } from '@domain-primitives/time';

/**
 * The first facts of a shop task: `tasks`' `SystemOpening` without `work` and `subjectId`.
 * Declared here, structurally, because a domain file may not import a sibling module. The
 * service adds the staff screen and hands the result to `tasks`, where the compiler checks the match.
 */
export interface ShopOpening {
    /** The situation. */
    kind: TaskKind;
    /** The permission set that works it; its holders are who hear of it. */
    routeSet: PermissionSetName;
    /** The record it is about. */
    link: { type: TaskLinkType; id: string };
    /** The inbox line. */
    subject: string;
    /** The task's body. */
    message: string;
    /** When it is overdue. */
    dueAt: Date;
    /** Set for a wait on someone else: no "due soon" reminder, see `SystemOpening`. */
    noDueSoon?: true;
}

/** How long a paid order without stock set aside may wait: the customer is already owed goods. */
const ORPHAN_WINDOW_MS = 4 * HOUR_MS;

/** How long a bank may take to decide a dispute: the card networks' usual outer limit, 75 days. */
const AWAITING_BANK_MS = 75 * DAY_MS;

/** FTC 16 CFR 435.2: a seller may delay up to 30 days past the promised date without consent. */
const FTC_GRACE_MS = 30 * DAY_MS;

/** The United States and its territories: where 16 CFR 435 binds a seller (the country codes of 16 CFR 435.1). */
export const FTC_JURISDICTIONS = ['US', 'PR', 'GU', 'VI', 'AS', 'MP'] as const;

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
): ShopOpening => ({
    kind: TaskKind.manual_refund_owed,
    routeSet: 'PaymentRefunding',
    link: { type: TaskLinkType.refund, id: refund.refundId },
    subject: 'Refund owed by hand',
    message: `Refund ${refund.refundId} on order ${refund.orderId} was paid by hand. Send the money back, then mark the refund returned.`,
    dueAt
});

/**
 * A provider success that is not the payment frozen for the order. Told to administrators only:
 * it is a question about the books, not a refund anyone else can settle.
 *
 * @param payment - the payment and its order
 * @param payment.orderId - the order that was canceled
 * @param dueAt - when it is overdue
 */
export const amountMismatchOpening = (
    payment: { paymentId: string; orderId: string },
    dueAt: Date
): ShopOpening => ({
    kind: TaskKind.amount_mismatch,
    routeSet: 'AuditDisplay',
    link: { type: TaskLinkType.payment, id: payment.paymentId },
    subject: 'Payment amount mismatch',
    message: `The provider reported a success for order ${payment.orderId} that is not payment ${payment.paymentId}. The order was canceled and the money is being returned. Find out why, then close this.`,
    dueAt
});

/**
 * A refund made in the provider's own dashboard that the import could not record. The money
 * moved and the books do not show it: staff re-sync, or record it themselves.
 *
 * @param refund - the refund and what it belongs to
 * @param refund.paymentId - the payment it was made on
 * @param refund.orderId - the order of that payment
 * @param refund.refundRef - the provider's refund id, to find it in the dashboard
 * @param refund.amount - the refund's amount, a decimal
 * @param refund.currency - the ISO code the provider refunded in
 * @param refund.reason - why the import could not record it
 * @param dueAt - when it is overdue
 */
export const refundUnrecordedOpening = (
    refund: {
        paymentId: string;
        orderId: string;
        refundRef: string;
        amount: string;
        currency: string;
        reason: 'lost_race' | 'other_currency';
    },
    dueAt: Date
): ShopOpening => ({
    kind: TaskKind.refund_unrecorded,
    routeSet: 'PaymentRefunding',
    link: { type: TaskLinkType.payment, id: refund.paymentId },
    subject: 'Refund made at the provider is not recorded',
    message:
        `A refund of ${refund.amount} ${refund.currency} (${refund.refundRef}) was made at the provider on payment ${refund.paymentId} of order ${refund.orderId}, and the shop has not recorded it. ` +
        (refund.reason === 'lost_race'
            ? 'Press "Re-sync refunds" on the payment, then close this.'
            : 'It is in another currency than the payment, so "Re-sync refunds" will not import it: record it outside the app (your accountant), then close this. A later re-sync or refund on this payment reminds you again.'),
    dueAt
});

/**
 * A return asked for money and the payment could not give all of it: part already went back another
 * way, or no payment stands behind it. The return keeps what it owes; staff check whether the
 * earlier money was for this return and pay any rest outside the app.
 *
 * @param short - the return and the two figures
 * @param short.returnId - the return, the record the to-do links to
 * @param short.orderId - the order it came from
 * @param short.asked - what the return owes the buyer, a decimal
 * @param short.opened - what the refund record opened for, a decimal (`0.00` when none was)
 * @param short.currency - the ISO code of both figures
 * @param dueAt - when it is overdue
 */
export const returnRefundShortOpening = (
    short: { returnId: string; orderId: string; asked: string; opened: string; currency: string },
    dueAt: Date
): ShopOpening => ({
    kind: TaskKind.return_refund_short,
    routeSet: 'ReturnReceiving',
    link: { type: TaskLinkType.return, id: short.returnId },
    subject: 'Return refund is smaller than owed',
    message:
        `Return ${short.returnId} of order ${short.orderId}: ${short.asked} ${short.currency} was owed, ${short.opened} ${short.currency} could be sent; the rest of the payment already went back another way. ` +
        'Check whether the buyer got what this return is owed and pay any rest outside the app. ' +
        'A return that is still received stays open until you press "Close return" on it, which clears this; otherwise close this yourself.',
    dueAt
});

/**
 * An order paid with nothing set aside for it.
 *
 * @param now - the clock
 */
export const paidWithoutHoldOpening = (orderId: string, now: Date): ShopOpening => ({
    kind: TaskKind.paid_without_hold,
    routeSet: 'InventoryManagement',
    link: { type: TaskLinkType.order, id: orderId },
    subject: 'Paid order without stock set aside',
    message: `Order ${orderId} is paid but no units were set aside for it. Find stock or cancel and refund it.`,
    dueAt: new Date(now.getTime() + ORPHAN_WINDOW_MS)
});

/** The legal deadline of a refund, as the to-do says it: the rule and the shop's calendar day. */
export interface LegalDeadline {
    /** Which rule sets the date. */
    rule: RefundDueRule;
    /** The deadline's day in the shop's zone, `YYYY-MM-DD`. */
    day: string;
}

/**
 * The sentence that puts the rule beside the date, so staff see why it is due then. A faulty item
 * is due the moment the goods or the proof came, so the date has already passed: "refund now".
 *
 * @param legal - the refund's legal deadline, when the law sets one
 * @returns the sentence with its leading space, or an empty string
 */
const legalDeadlineNote = (legal: LegalDeadline | undefined): string => {
    if (!legal) return '';
    return legal.rule === RefundDueRule.withdrawal
        ? ` Legal refund deadline (withdrawal): ${legal.day}.`
        : ' Legal refund deadline (faulty item): refund now.';
};

/**
 * The extra advice for a refund a dispute refused or took back while no dispute is open: the
 * dispute's outcome decides what staff do, and only the provider's dashboard shows it.
 *
 * @param failureReason - the closed code the provider gave
 * @param advice - what to do once the outcome is known
 * @returns the sentence with its leading space, or an empty string for any other reason
 */
const disputeAdvice = (failureReason: string, advice: string): string =>
    failureReason === RefundFailureReason.disputed
        ? ` A dispute caused this and none is open: check it in the provider's dashboard first. ${advice}`
        : '';

/** What staff do with a refused refund once they know how the dispute ended. */
const REFUSED_DISPUTE_ADVICE =
    'If the bank kept the money, pay any small rest outside the app, then mark the refund returned; if the shop won, void the refund and refund by card.';

/**
 * A refund the provider refused for good: the money has to go back another way.
 *
 * @param refund - the refund and what it belongs to
 * @param refund.refundId - the refund record
 * @param refund.orderId - the order it pays back
 * @param refund.failureReason - the closed code of the refusal
 * @param dueAt - when it is overdue
 * @param legal - the legal deadline and its rule, when the law sets one
 */
export const refundRefusedOpening = (
    refund: { refundId: string; orderId: string; failureReason: string },
    dueAt: Date,
    legal?: LegalDeadline
): ShopOpening => ({
    kind: TaskKind.refund_refused,
    routeSet: 'PaymentRefunding',
    link: { type: TaskLinkType.refund, id: refund.refundId },
    subject: 'Refund refused by the provider',
    message: `Refund ${refund.refundId} on order ${refund.orderId} was refused for good (${refund.failureReason}). Return the money another way, then mark the refund returned.${disputeAdvice(refund.failureReason, REFUSED_DISPUTE_ADVICE)}${legalDeadlineNote(legal)}`,
    dueAt
});

/**
 * A refund the bank sent back after it had settled: the shop owes the money again.
 *
 * @param refund - the refund and what it belongs to
 * @param refund.refundId - the refund record
 * @param refund.orderId - the order it pays back
 * @param refund.failureReason - the closed code the provider gave
 * @param dueAt - when it is overdue
 * @param legal - the legal deadline and its rule, when the law sets one
 */
export const refundReversedOpening = (
    refund: { refundId: string; orderId: string; failureReason: string },
    dueAt: Date,
    legal?: LegalDeadline
): ShopOpening => ({
    kind: TaskKind.refund_reversed,
    routeSet: 'PaymentRefunding',
    link: { type: TaskLinkType.refund, id: refund.refundId },
    subject: 'Refund sent back by the bank',
    message: `Refund ${refund.refundId} on order ${refund.orderId} settled, but the bank returned it (${refund.failureReason}). Agree a way with the buyer, pay, then mark the refund returned.${disputeAdvice(refund.failureReason, 'Do not pay twice: if the bank kept the money, the buyer already has it.')}${legalDeadlineNote(legal)}`,
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
): ShopOpening => ({
    kind: TaskKind.dispute,
    routeSet: 'PaymentRefunding',
    link: { type: TaskLinkType.payment, id: dispute.paymentId },
    subject: `Payment dispute (${dispute.kind})`,
    message: `The buyer's bank opened a ${dispute.kind} on payment ${dispute.paymentId} of order ${dispute.orderId} (${dispute.reason}). Send the evidence in the provider's dashboard before the deadline.`,
    dueAt: dispute.evidenceDueBy ? new Date(dispute.evidenceDueBy) : fallbackDueAt
});

/**
 * The wait after the proof is sent: nothing to do unless the bank runs late. Not a deadline of the
 * shop's, so no "due soon" reminder; it is overdue only past the bank's usual limit.
 *
 * @param dispute - the dispute as the provider last reported it
 * @param dispute.paymentId - the disputed payment
 * @param now - the clock
 */
export const disputeAwaitingBankOpening = (
    dispute: { paymentId: string },
    now: Date
): ShopOpening => ({
    kind: TaskKind.dispute_awaiting_bank,
    routeSet: 'PaymentRefunding',
    link: { type: TaskLinkType.payment, id: dispute.paymentId },
    subject: 'Dispute: waiting for the bank',
    message: `Proof sent. Waiting for the bank's decision on payment ${dispute.paymentId}. Nothing to do unless it runs late.`,
    dueAt: new Date(now.getTime() + AWAITING_BANK_MS),
    noDueSoon: true
});

/** What a delay notice says, as far as the consent reminder is concerned. */
export interface DelayFacts {
    /** The fulfillment order the delay is on. */
    fulfillmentOrderId: string;
    /** The order it belongs to. */
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
 * Whether the rule binds this shipment: a seller in the United States or a territory owes it to
 * every destination, and one anywhere else owes it to a buyer shipped to those places.
 *
 * @param shopCountry - the shop's own country, when configured
 * @param shipCountry - where the order ships to, when known
 */
const bindsThisShipment = (shopCountry?: string, shipCountry?: string): boolean =>
    FTC_JURISDICTIONS.some((code) => code === shopCountry || code === shipCountry);

/**
 * The reminder that a person must ask the buyer's consent to a delay (16 CFR 435.2(b)). The shop
 * never asks and never cancels: this is the note that someone must, and by when.
 *
 * | Before this notice                   | Opens when                              | Due                  |
 * | ------------------------------------ | --------------------------------------- | -------------------- |
 * | the buyer holds the date they ordered | no new date, or one past agreed + 30 d  | agreed + 30 d        |
 * | the buyer holds a later date          | no new date, or one past that date      | that date            |
 * | the buyer was told "no date yet"      | never: the earlier task stands        |                      |
 *
 * @param delay - the notice
 * @param shopCountry - the shop's own country: in the United States every destination counts
 * @returns what to open, or `undefined` when no consent is owed
 */
export const consentDueOpening = (
    delay: DelayFacts,
    shopCountry?: string
): ShopOpening | undefined => {
    if (!bindsThisShipment(shopCountry, delay.shipCountry)) return undefined;
    // Told "no date yet" earlier: the task that was opened then still stands.
    if (!delay.promisedAt) return undefined;

    const agreed = new Date(delay.agreedAt).getTime();
    const promised = new Date(delay.promisedAt).getTime();
    const held = promised > agreed ? promised : agreed + FTC_GRACE_MS;
    // A later date inside what the buyer already holds needs no new consent.
    if (delay.expectedAt && new Date(delay.expectedAt).getTime() <= held) return undefined;

    return {
        kind: TaskKind.consent_due,
        routeSet: 'OrderEditing',
        link: { type: TaskLinkType.fulfillment_order, id: delay.fulfillmentOrderId },
        subject: 'Delay: the buyer must be asked',
        message: `Order ${delay.orderId} will not ship by the date the buyer holds. Ask them whether they accept the delay; if they do not answer or refuse, cancel and refund by the due date (16 CFR 435.2).`,
        dueAt: new Date(held)
    };
};
