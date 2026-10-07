/**
 * @module
 * The copy of every mail this module sends, resolved into finished strings — the language is an
 * argument, the output is finished text, and the template queued behind it only interpolates.
 * Same rule as `@modules/account/emails`; see that file for why. The invoice document's own copy
 * lives in `@modules/invoicing`'s own `emails.ts`, not here — see `docs/modules/invoicing.md`.
 */

import type { EmailContent } from '@infrastructure/adapters/mailer';
import { translator } from '@infrastructure/i18n';
import {
    orderFrontendLink,
    orderCurrency,
    returnAddress,
    returnPostagePayer,
    shopIdentity,
    withdrawalPeriodDays,
    type ReturnAddress
} from './config';
import { isExcludedFromWithdrawal, isShippedItem, orderTotal } from './domain';
import type { OrderTransferInstructions } from '@types';

/**
 * The minimum either document needs from an order: a title and a price per line.
 *
 * Structural rather than `OrderDocument`: what the documents print is the lines, and asking for
 * less than the whole document keeps both builders callable from a test with a two-line fixture.
 *
 * `product.title` arrives already resolved into the order's own frozen locale — see
 * `OrderDocumentItem.locale` and `resolveSnapshotProducts` — never the recipient's or the
 * request's. Neither builder below re-resolves it; they only interpolate.
 */
export interface OrderLines {
    items: {
        quantity: number;
        product: {
            title: string;
            price: number;
            /** Frozen at checkout; absent counts as shipped. */
            requiresShipping?: boolean | null;
            /** Frozen at checkout: Art. 16 takes the right of withdrawal away from this line. */
            noWithdrawal?: boolean | null;
        };
    }[];
    /** The shipping frozen at checkout. Absent on an order that chose no delivery method. */
    shippingCost?: number;
    /** The order's own frozen currency; `orderCurrency`'s fallback covers an order that predates it. */
    currency?: string;
}

/**
 * What every builder below actually quotes — `orderTotal`, resolved against `order`'s own
 * currency. Explicit fields, not `{ ...order, currency }`: `order` is often a hydrated Mongoose
 * document (`notify.ts`, `cancel.ts`), whose schema paths are prototype getters a spread copies
 * nothing from.
 */
const totalOf = (order: OrderLines): number =>
    orderTotal({
        items: order.items,
        shippingCost: order.shippingCost,
        currency: orderCurrency(order)
    });

/** Days the law gives to hand goods back and to reimburse, whatever longer window the shop offers. */
const STATUTORY_DAYS = 14;

/** What the withdrawal notice says, as finished strings; `effects` and `form` are empty when they do not apply. */
export interface WithdrawalNotice {
    heading: string;
    /** The right, its period, how to use it, and the exclusions. */
    terms: string[];
    effectsHeading: string;
    /** What happens to money and goods once a consumer withdraws. */
    effects: string[];
    formHeading: string;
    /** The model withdrawal form, one row per string. */
    form: string[];
}

/**
 * A postal address on one line, skipping whatever is absent.
 * @param address - the address to print
 */
export const addressLine = (address: ReturnAddress): string =>
    [address.name, address.street, `${address.zip} ${address.city}`, address.country]
        .filter(Boolean)
        .join(', ');

/**
 * Which clock the notice describes: `goods` when a withdrawable line ships (period from receipt),
 * `digital` when every withdrawable line is digital (period from the contract), `none` when
 * Art. 16 excludes every line. The same split the code uses to start the clock.
 * @param order - the order's lines
 */
const withdrawalCase = (order: OrderLines): 'goods' | 'digital' | 'none' => {
    const withdrawable = order.items.filter((item) => !isExcludedFromWithdrawal(item));
    if (withdrawable.length === 0) return 'none';
    return withdrawable.some((item) => isShippedItem(item)) ? 'goods' : 'digital';
};

/**
 * The rows of the model withdrawal form (Annex I(B)), the "To" row filled with the trader.
 * @param t - the translator
 * @param trader - the shop's name, address, phone and e-mail, as one line
 */
const withdrawalForm = (t: ReturnType<typeof translator>, trader: string): string[] => [
    t('orders.email-withdrawal.form-intro'),
    t('orders.email-withdrawal.form-to', { trader }),
    t('orders.email-withdrawal.form-notice'),
    t('orders.email-withdrawal.form-ordered'),
    t('orders.email-withdrawal.form-name'),
    t('orders.email-withdrawal.form-address'),
    t('orders.email-withdrawal.form-signature'),
    t('orders.email-withdrawal.form-date'),
    t('orders.email-withdrawal.form-delete')
];

/**
 * What the goods-only half of the notice adds: where to send them, who pays, and the refund hold
 * (Annex I(A) notes 4 and 5).
 * @param t - the translator
 */
const goodsEffects = (t: ReturnType<typeof translator>): string[] => [
    t('orders.email-withdrawal.withhold'),
    t('orders.email-withdrawal.send-back', {
        recipient: addressLine(returnAddress()),
        returnDays: STATUTORY_DAYS
    }),
    t(
        returnPostagePayer() === 'shop'
            ? 'orders.email-withdrawal.postage-shop'
            : 'orders.email-withdrawal.postage-consumer'
    ),
    t('orders.email-withdrawal.diminished')
];

/**
 * The right-of-withdrawal information and model form every placed-order email must carry on a
 * durable medium (CRD Art. 6(1)(h), 8(7) and Annex I). Every placeholder is filled: the period, the
 * shop's identity, where goods go, who pays postage. Lines Art. 16 excludes are named.
 *
 * @param locale - the recipient's language
 * @param order - the order's lines
 * @param orderId - the order the withdrawal button lives on
 */
export const withdrawalNotice = (
    locale: string,
    order: OrderLines,
    orderId: string
): WithdrawalNotice => {
    const t = translator(locale);
    const heading = t('orders.email-withdrawal.heading');
    const kind = withdrawalCase(order);
    const excluded = order.items.filter((item) => isExcludedFromWithdrawal(item));
    const excludedNote =
        excluded.length > 0 && kind !== 'none'
            ? [
                  t('orders.email-withdrawal.excluded', {
                      titles: new Intl.ListFormat(locale, { type: 'conjunction' }).format(
                          excluded.map((item) => item.product.title)
                      )
                  })
              ]
            : [];
    if (kind === 'none')
        return {
            heading,
            terms: [t('orders.email-withdrawal.none')],
            effectsHeading: '',
            effects: [],
            formHeading: '',
            form: []
        };

    const identity = shopIdentity();
    const trader = t('orders.email-withdrawal.trader', {
        name: identity.legalName,
        address: addressLine(identity),
        phone: identity.phone,
        email: identity.email
    });
    const days = withdrawalPeriodDays();
    return {
        heading,
        terms: [
            t('orders.email-withdrawal.right', { days }),
            t(`orders.email-withdrawal.period-${kind}`, { days }),
            t('orders.email-withdrawal.how', { trader }),
            t('orders.email-withdrawal.online', {
                url: orderFrontendLink({ locale, id: orderId })
            }),
            t('orders.email-withdrawal.deadline'),
            ...excludedNote
        ],
        effectsHeading: t('orders.email-withdrawal.effects-heading'),
        effects: [
            t('orders.email-withdrawal.effects', { refundDays: STATUTORY_DAYS }),
            ...(kind === 'goods' ? goodsEffects(t) : [])
        ],
        formHeading: t('orders.email-withdrawal.form-heading'),
        form: withdrawalForm(t, trader)
    };
};

/**
 * The placed-order email, sent to the customer — "order received, awaiting payment", never
 * "confirmed": every order this builds for is still `pending` at send time (a `bank_transfer`
 * order gets {@link bankTransferInstructionsEmail} instead, the only other placed-order mail).
 * The bought lines are resolved here, one translated string each, since per-line copy interpolates
 * per-line values and can't be a single string decided up front. The total is `orderTotal`'s
 * arithmetic, not a fresh sum — the email quotes what the order stands for, shipping included.
 *
 * Sent immediately at order creation, never held for anything the receipt needs: it renders on
 * demand, the moment someone actually asks for it. `linkUrl` points at the order's page, where
 * the download button is always live.
 */
export const orderConfirmEmail = (
    locale: string,
    name: string,
    order: OrderLines,
    orderId: string
): EmailContent => {
    const t = translator(locale);
    const withdrawal = withdrawalNotice(locale, order, orderId);
    return {
        template: 'orders.order-confirm',
        subject: t('orders.email-confirm.subject'),
        data: {
            locale,
            pageMetaTitle: t('orders.email-confirm.meta-title'),
            pageMetaLinks: [],
            greeting: t('orders.email-confirm.greeting', { name }),
            body: t('orders.email-confirm.body'),
            lines: order.items.map((item) =>
                t('orders.email-confirm.line', {
                    title: item.product.title,
                    quantity: item.quantity,
                    price: item.product.price
                })
            ),
            total: t('orders.email-confirm.total', { total: totalOf(order) }),
            linkLabel: t('orders.email-confirm.link-label'),
            linkUrl: orderFrontendLink({ locale, id: orderId }),
            withdrawalHeading: withdrawal.heading,
            withdrawalTerms: withdrawal.terms,
            withdrawalEffectsHeading: withdrawal.effectsHeading,
            withdrawalEffects: withdrawal.effects,
            withdrawalFormHeading: withdrawal.formHeading,
            withdrawalForm: withdrawal.form,
            footer: t('email.footer')
        }
    };
};

/**
 * Payment received, sent once `payments`' settlement actually commits the stock —
 * `services/settlement.ts`'s `settlePayment` is the one caller. The customer's answer to "did my
 * card go through": {@link orderConfirmEmail} only ever said the order was received, never that
 * it was paid.
 */
export const paymentSucceededEmail = (
    locale: string,
    name: string,
    order: OrderLines,
    orderId: string
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'orders.order-paid',
        subject: t('orders.email-paid.subject'),
        data: {
            locale,
            pageMetaTitle: t('orders.email-paid.meta-title'),
            pageMetaLinks: [],
            greeting: t('orders.email-paid.greeting', { name }),
            body: t('orders.email-paid.body'),
            lines: order.items.map((item) =>
                t('orders.email-paid.line', {
                    title: item.product.title,
                    quantity: item.quantity,
                    price: item.product.price
                })
            ),
            total: t('orders.email-paid.total', { total: totalOf(order) }),
            linkLabel: t('orders.email-paid.link-label'),
            linkUrl: orderFrontendLink({ locale, id: orderId }),
            footer: t('email.footer')
        }
    };
};

/**
 * The instructions and deadline for a `bank_transfer` checkout, sent instead of
 * {@link orderConfirmEmail} — there is nothing to confirm yet, only what the customer still has
 * to do. `payBy` is formatted with `Intl.DateTimeFormat` in the recipient's own language rather
 * than a hand-rolled date string, the same `node:` standard-library-first rule that keeps this
 * repo away from a date-formatting dependency.
 */
export const bankTransferInstructionsEmail = (
    locale: string,
    name: string,
    order: OrderLines,
    instructions: OrderTransferInstructions,
    payBy: Date,
    orderId: string
): EmailContent => {
    const t = translator(locale);
    const withdrawal = withdrawalNotice(locale, order, orderId);
    return {
        template: 'orders.order-transfer-instructions',
        subject: t('orders.email-transfer.subject'),
        data: {
            locale,
            pageMetaTitle: t('orders.email-transfer.meta-title'),
            pageMetaLinks: [],
            greeting: t('orders.email-transfer.greeting', { name }),
            body: t('orders.email-transfer.body'),
            beneficiary: instructions.beneficiary,
            iban: instructions.iban,
            // Not a conditional spread: `undefined` here still reads as "unset" to the
            // template's `typeof bic !== "undefined"` guard, and a bare key keeps this object a
            // plain literal `tests/cross-cutting/mail-copy.test.ts` can read statically.
            bic: instructions.bic,
            reference: instructions.reference,
            deadline: t('orders.email-transfer.deadline', {
                payBy: new Intl.DateTimeFormat(locale, {
                    dateStyle: 'long',
                    timeStyle: 'short'
                }).format(payBy)
            }),
            total: t('orders.email-confirm.total', { total: totalOf(order) }),
            // Order-number allocation doesn't wait on payment (see `order-numbering.ts`), so the
            // same link, rendering the same receipt on demand, applies here as on the paid path.
            linkLabel: t('orders.email-transfer.link-label'),
            linkUrl: orderFrontendLink({ locale, id: orderId }),
            withdrawalHeading: withdrawal.heading,
            withdrawalTerms: withdrawal.terms,
            withdrawalEffectsHeading: withdrawal.effectsHeading,
            withdrawalEffects: withdrawal.effects,
            withdrawalFormHeading: withdrawal.formHeading,
            withdrawalForm: withdrawal.form,
            footer: t('email.footer')
        }
    };
};

/**
 * The sweep cancelling a `bank_transfer` order whose deadline passed with no money — the
 * customer's answer to "what happened to my order".
 */
export const bankTransferExpiredEmail = (locale: string, order: OrderLines): EmailContent => {
    const t = translator(locale);
    return {
        template: 'orders.order-transfer-expired',
        subject: t('orders.email-transfer-expired.subject'),
        data: {
            locale,
            pageMetaTitle: t('orders.email-transfer-expired.meta-title'),
            pageMetaLinks: [],
            greeting: t('orders.email-transfer-expired.greeting'),
            body: t('orders.email-transfer-expired.body'),
            total: t('orders.email-confirm.total', { total: totalOf(order) }),
            footer: t('email.footer')
        }
    };
};

/**
 * {@link bankTransferExpiredEmail}'s twin for a `card` hold — a customer who never finished
 * checkout gets the same explanation once the thirty-minute reservation lapses, its own template
 * since the wording differs (a hold, not a deadline sent up front).
 */
export const cardHoldExpiredEmail = (locale: string, order: OrderLines): EmailContent => {
    const t = translator(locale);
    return {
        template: 'orders.order-card-expired',
        subject: t('orders.email-card-expired.subject'),
        data: {
            locale,
            pageMetaTitle: t('orders.email-card-expired.meta-title'),
            pageMetaLinks: [],
            greeting: t('orders.email-card-expired.greeting'),
            body: t('orders.email-card-expired.body'),
            total: t('orders.email-confirm.total', { total: totalOf(order) }),
            footer: t('email.footer')
        }
    };
};

/**
 * An amount in a currency, spelled the way the recipient's locale writes money.
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat
 * @param locale - the recipient's language
 * @param amount - a decimal in `currency`
 * @param currency - an ISO-4217 code
 */
const money = (locale: string, amount: number, currency: string): string =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);

/**
 * What a cancellation did to the buyer's money, as the copy key that says it: money taken and
 * going back, money taken and kept (an operator cancelled without refunding), or no money taken.
 * @param paid - whether the order was ever paid (`paidAt` set)
 * @param refund - whether the cancel decided to give the money back
 */
const cancelledRefundKey = (paid: boolean, refund: boolean): string => {
    if (!paid) return 'refund-unpaid';
    return refund ? 'refund-paid' : 'refund-none';
};

/**
 * The customer's answer to "what happened to my order" when a PERSON cancelled it — their own
 * cancel, or staff's. Says what the cancel did to their money: the amount going back, no refund,
 * or nothing charged to begin with. The other cancels each mail their own explanation (the
 * reservation sweep, a product removed, a withdrawal), so none reaches this builder.
 *
 * @param locale - the recipient's language
 * @param name - the greeting's name
 * @param order - the cancelled order; `paidAt` says whether money was ever taken
 * @param orderRef - the order's human number, or its id when it has none
 * @param refund - whether the cancel returns the money
 */
export const orderCancelledEmail = (
    locale: string,
    name: string,
    order: OrderLines & { paidAt?: Date | null },
    orderRef: string,
    refund: boolean
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'orders.order-cancelled',
        subject: t('orders.email-cancelled.subject'),
        data: {
            locale,
            pageMetaTitle: t('orders.email-cancelled.meta-title'),
            pageMetaLinks: [],
            greeting: t('orders.email-cancelled.greeting', { name }),
            body: t('orders.email-cancelled.body', { order: orderRef }),
            refundNote: t(`orders.email-cancelled.${cancelledRefundKey(!!order.paidAt, refund)}`, {
                amount: money(locale, totalOf(order), orderCurrency(order))
            }),
            footer: t('email.footer')
        }
    };
};

/**
 * Money went back to the customer outside a return — a refund that followed a cancel, or an
 * operator's own goodwill refund. A return's refund is announced by `returns`' own closing notice,
 * so it never reaches this builder. Sent when the refund SETTLES, not when it is asked for, so it
 * only ever says what already happened.
 *
 * @param locale - the recipient's language
 * @param name - the greeting's name
 * @param orderRef - the order's human number, or its id when it has none
 * @param refund - the amount that went back, a decimal in `currency`
 * @param full - whether this completes the refund of everything the customer paid
 */
export const refundIssuedEmail = (
    locale: string,
    name: string,
    orderRef: string,
    refund: { amount: number; currency: string },
    full: boolean
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'orders.order-refunded',
        subject: t('orders.email-refunded.subject'),
        data: {
            locale,
            pageMetaTitle: t('orders.email-refunded.meta-title'),
            pageMetaLinks: [],
            greeting: t('orders.email-refunded.greeting', { name }),
            body: t('orders.email-refunded.body', {
                order: orderRef,
                amount: money(locale, refund.amount, refund.currency)
            }),
            detail: t(`orders.email-refunded.${full ? 'detail-full' : 'detail-partial'}`),
            footer: t('email.footer')
        }
    };
};
