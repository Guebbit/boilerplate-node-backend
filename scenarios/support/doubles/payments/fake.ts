/**
 * @module
 * The fake PSP — a test double, never shipped: it lives outside `src/` and is registered only by
 * the dev preload and the jest setup (`./register`). It never talks to the outside world, but
 * imposes the same shape a real PSP does: it hands back an intent reference the browser finishes
 * against, it answers with the asynchronous states (`requires_action`, `processing`) as well as
 * the terminal ones, and it signs its webhooks. That is what lets the demo and every e2e walk the
 * 3-D Secure and the webhook paths without an account anywhere.
 *
 * The method references below mirror the shape of a real provider's test tokens: an opaque
 * handle the browser produced, never a card number.
 */

import { createHmac } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { logger } from '@infrastructure/adapters/logger';
import type { RefundFailureReason } from '@types';
import { FINAL_REFUND_FAILURES } from '@modules/payments/domain';
import {
    PaymentInFlightError,
    PaymentProviderError,
    verifyWebhookSignature,
    WEBHOOK_SIGNATURE_HEADER,
    WebhookRejected,
    type PaymentProvider,
    type ProviderPaymentState,
    type ProviderRefundState,
    type ProviderWebhookEvent
} from '@modules/payments/providers';

/**
 * The method references this provider recognises, and what each one does. Anything else succeeds
 * — the demo's default path — with its last four digits taken from the reference's own tail.
 */
const TEST_METHODS: Record<string, ProviderPaymentState & { settlesTo: ProviderPaymentState }> = {
    pm_card_declined: {
        status: 'declined',
        cardLast4: '0002',
        settlesTo: { status: 'declined', cardLast4: '0002' }
    },
    pm_card_authentication_required: {
        status: 'requires_action',
        cardLast4: '3155',
        settlesTo: { status: 'succeeded', cardLast4: '3155' }
    },
    pm_card_processing: {
        status: 'processing',
        cardLast4: '0000',
        settlesTo: { status: 'succeeded', cardLast4: '0000' }
    }
};

/** The reference the demo's panel sends unless the customer picks another. */
export const FAKE_SUCCESS_METHOD = 'pm_card_visa';

/** The one reference that is refused, so the decline path is one documented value away. */
export const FAKE_DECLINE_METHOD = 'pm_card_declined';

/**
 * Where a confirmed intent's eventual outcome is remembered, so `retrieve` can answer what the
 * customer will end up with rather than re-deciding it.
 *
 * In memory, and deliberately: this is a stub, and a stub that needed a collection would be a
 * second payments database to keep consistent. The cost is that a restart — or a second worker —
 * forgets, which is why {@link retrieve} answers `processing` for a reference it does not know:
 * an unknown intent must settle NOTHING, and `processing` is the only state that settles nothing.
 */
const outcomes = new Map<string, ProviderPaymentState>();

/**
 * What each intent was prepared for, so a `succeeded` can report what was "collected": the amount
 * and currency it was opened with and the payment id it carries — what a real provider echoes back.
 * Same in-memory trade-off as {@link outcomes}: an intent this process never prepared reports none.
 */
const intents = new Map<string, { amount: number; currency: string; paymentId: string }>();

/** What {@link setFakeReceipt} may override in a `succeeded` answer, per intent. */
type ReceiptOverride = Pick<ProviderPaymentState, 'amountReceived' | 'currency' | 'paymentId'>;

/** Receipts a test has told the provider to report differently from what was prepared. */
const receiptOverrides = new Map<string, ReceiptOverride>();

/**
 * A `succeeded` state carries what was collected: the override if a test set one, else what the
 * intent was prepared for. Any other state reports no money at all.
 *
 * @param providerRef - the intent
 * @param state - the state about to be answered
 */
const withReceipt = (providerRef: string, state: ProviderPaymentState): ProviderPaymentState => {
    if (state.status !== 'succeeded') return state;
    const prepared = intents.get(providerRef);
    const override = receiptOverrides.get(providerRef);
    return {
        ...state,
        amountReceived: override?.amountReceived ?? state.amountReceived ?? prepared?.amount,
        currency: override?.currency ?? state.currency ?? prepared?.currency,
        paymentId: override?.paymentId ?? state.paymentId ?? prepared?.paymentId
    };
};

/**
 * Test lever: make this intent's `succeeded` report a different amount, currency or payment id
 * than it was prepared with — what a provider collecting the wrong money looks like. Applies to
 * both `confirm` and `retrieve`. Fields left out keep what the intent was prepared with.
 *
 * @param providerRef - the intent
 * @param receipt - the fields to report differently
 */
export const setFakeReceipt = (providerRef: string, receipt: ReceiptOverride): void => {
    receiptOverrides.set(providerRef, receipt);
};

/**
 * Test lever: what the provider will answer for `providerRef` from now on, as if the customer had
 * finished it at the provider with no `confirm` ever reaching this server — a 3-D Secure completed
 * in another tab, a bank debit that cleared. It is the only way to get a webhook to find an
 * outcome nobody confirmed, since a delivery's own body carries none.
 *
 * @param providerRef - the intent the outcome is for
 * @param state - what `retrieve` answers for it
 */
export const setFakeOutcome = (providerRef: string, state: ProviderPaymentState): void => {
    outcomes.set(providerRef, state);
};

/** Refunds a test has told the provider to refuse, per intent, with the reason to give. */
const refundFailures = new Map<string, RefundFailureReason>();

/**
 * Test lever: make every refund on this intent refuse with `reason`, the way a real adapter's
 * classified error would arrive. Pass `undefined` to let refunds through again.
 *
 * @param providerRef - the intent whose refunds should fail
 * @param reason - the closed code to throw, or `undefined` to clear
 */
export const setFakeRefundFailure = (
    providerRef: string,
    reason: RefundFailureReason | undefined
): void => {
    if (reason) refundFailures.set(providerRef, reason);
    else refundFailures.delete(providerRef);
};

/** Intents whose next refund runs at the provider but whose answer is lost (a timeout). */
const refundTimeouts = new Set<string>();

/**
 * Test lever: the next refund on this intent EXECUTES at the provider, but the answer never comes
 * back (`provider_unavailable`) — the case that makes "the provider refused it" unsafe to assume.
 * One shot: the flag clears itself.
 *
 * @param providerRef - the intent
 * @param on - `true` to arm, `false` to clear
 */
export const setFakeRefundTimeout = (providerRef: string, on: boolean): void => {
    if (on) refundTimeouts.add(providerRef);
    else refundTimeouts.delete(providerRef);
};

/** How long the fake remembers an idempotency key, as Stripe does: a day from its FIRST use. */
const KEY_WINDOW_MS = 24 * 60 * 60_000;

/** What a key first produced: the refund it made (and how far it had got), or the definite error it got. */
interface KeyedAnswer {
    at: number;
    refundRef?: string;
    status?: 'pending' | 'succeeded';
    failure?: RefundFailureReason;
}

/** One refund the fake holds, the way a provider keeps it as an object of its own. */
interface FakeRefund extends ProviderRefundState {
    providerRef: string;
}

/** Every refund the fake made, by the provider's refund id: its own status can change later. */
const refundObjects = new Map<string, FakeRefund>();

/** Intents whose next refunds are accepted but not settled (Stripe `pending`). */
const pendingRefundIntents = new Set<string>();

/**
 * Test lever: refunds on this intent are accepted but stay `pending` at the provider, until
 * {@link setFakeRefundOutcome} settles them. Pass `false` to let refunds settle at once again.
 *
 * @param providerRef - the intent
 * @param on - `true` to hold refunds pending
 */
export const setFakeRefundPending = (providerRef: string, on: boolean): void => {
    if (on) pendingRefundIntents.add(providerRef);
    else pendingRefundIntents.delete(providerRef);
};

/**
 * Test lever: change what the provider reports for one refund from now on — a `pending` one that
 * settles, or a settled one that fails.
 *
 * @param refundRef - the provider's refund id (`refundRefOfRecord` finds it from our record id)
 * @param state - the status to report, and the closed reason when it is `failed`
 * @throws {Error} when the fake made no such refund
 */
export const setFakeRefundOutcome = (
    refundRef: string,
    state: Pick<ProviderRefundState, 'status' | 'failureReason'>
): void => {
    const known = refundObjects.get(refundRef);
    if (!known) throw new Error(`[fake-psp] no refund ${refundRef}`);
    known.status = state.status;
    if (state.failureReason) known.failureReason = state.failureReason;
    else delete known.failureReason;
};

/**
 * Test lever: a refund that settled fails days later, the way a bank sends a payout back.
 *
 * @param refundRef - the provider's refund id
 * @param failureReason - why; `declined` unless said otherwise
 */
export const setFakeLateRefundFailure = (
    refundRef: string,
    failureReason: RefundFailureReason = 'declined'
): void => {
    setFakeRefundOutcome(refundRef, { status: 'failed', failureReason });
};

/**
 * The provider's refund id for one of our refund records, once the fake has made it.
 *
 * @param refundId - our record id, as stamped on the refund
 */
export const refundRefOfRecord = (refundId: string): string | undefined =>
    refundsByRecord.get(refundId);

/** Answers by idempotency key, replayed within {@link KEY_WINDOW_MS}. */
const keyedAnswers = new Map<string, KeyedAnswer>();

/** Refunds the fake made, by the record id the caller stamped on them (Stripe's `metadata`). */
const refundsByRecord = new Map<string, string>();

/**
 * Test lever: make every remembered idempotency key `ms` older, as if that much time had passed
 * since each was first used. Pushes a key past the 24-hour window without waiting.
 *
 * @param ms - how much older to make them
 */
export const ageFakeRefundKeys = (ms: number): void => {
    for (const answer of keyedAnswers.values()) answer.at -= ms;
};

/** How many refunds the fake has really made (replays and refusals excluded). */
export const fakeRefundsMade = (): number => refundsByRecord.size;

/**
 * `providerRef`s this stub has already cancelled — so a second `cancel` of the same one is the
 * provider's own idempotent success, never a repeat refusal.
 */
const cancelledIntents = new Set<string>();

/** The last four digits a reference implies: its own trailing digits, or the demo's default. */
const lastFourOf = (paymentMethodRef: string): string =>
    /(\d{4})$/u.exec(paymentMethodRef)?.[1] ?? '4242';

/** What a reference resolves to now, and what it will resolve to once it settles. */
const outcomeFor = (paymentMethodRef: string) =>
    TEST_METHODS[paymentMethodRef] ?? {
        status: 'succeeded' as const,
        cardLast4: lastFourOf(paymentMethodRef),
        settlesTo: {
            status: 'succeeded' as const,
            cardLast4: lastFourOf(paymentMethodRef)
        }
    };

/**
 * Every call is logged — the point of a stub rather than noise, since a real PSP leaves its own
 * trail and this one otherwise looks identical to an integration that was never called.
 */
export const fakePaymentProvider: PaymentProvider = {
    name: 'fake',

    // Derived from the payment id rather than generated, which makes it idempotent for free: the
    // double-click case prepares the same reference twice instead of opening a second intent.
    prepare: (charge, metadata, existingProviderRef) => {
        const providerRef = existingProviderRef ?? `fake_pi_${metadata.paymentId}`;
        intents.set(providerRef, { ...charge, paymentId: metadata.paymentId });
        // Stryker disable all
        logger.info(
            `[fake-psp] prepare ${charge.amount} ${charge.currency} for order ${metadata.orderId} → ${providerRef}`
        );
        // Stryker restore all
        return Promise.resolve({
            providerRef,
            // Signed rather than random, for the same reason the reference is derived: re-preparing
            // must not invalidate a secret the browser is already holding.
            clientSecret: `${providerRef}_secret_${createHmac('sha256', 'fake-psp')
                .update(providerRef)
                .digest('hex')
                .slice(0, 24)}`
        });
    },

    confirm: (providerRef, paymentMethodRef) => {
        const { settlesTo, ...state } = outcomeFor(paymentMethodRef);
        outcomes.set(providerRef, settlesTo);
        // Stryker disable all
        logger.info(
            `[fake-psp] confirm ${providerRef} with ****${state.cardLast4} → ${state.status}`
        );
        // Stryker restore all
        return Promise.resolve(withReceipt(providerRef, state));
    },

    retrieve: (providerRef) => {
        // No outcome on record: the intent was prepared and never confirmed, which a real provider
        // reports as an open intent, not as money in flight.
        const state = outcomes.get(providerRef) ?? { status: 'open' as const };
        // Stryker disable next-line all
        logger.info(`[fake-psp] retrieve ${providerRef} → ${state.status}`);
        return Promise.resolve(withReceipt(providerRef, state));
    },

    // Behaves like Stripe's idempotency: within a day of a key's first use the same answer is
    // replayed (a definite refusal included); after that the key is forgotten, and only the
    // adapter's own lookup by `refundId` (for a record older than a day) prevents a second refund.
    refund: (providerRef, charge, { idempotencyKey, refundId, createdAt }) => {
        const known = keyedAnswers.get(idempotencyKey);
        if (known && Date.now() - known.at < KEY_WINDOW_MS) {
            if (known.failure)
                return Promise.reject(
                    new PaymentProviderError(
                        known.failure,
                        `[fake-psp] replayed refusal: ${known.failure}`
                    )
                );
            // The ORIGINAL answer is replayed, not the refund's status now: that is how a key works.
            if (known.refundRef)
                return Promise.resolve({
                    refundRef: known.refundRef,
                    status: known.status ?? 'succeeded'
                });
        }

        // The adapter duty past the key window: adopt the refund this record already made.
        const made = refundsByRecord.get(refundId);
        if (made && Date.now() - createdAt.getTime() >= KEY_WINDOW_MS)
            return Promise.resolve({
                refundRef: made,
                status: refundObjects.get(made)?.status === 'pending' ? 'pending' : 'succeeded'
            });

        const failure = refundFailures.get(providerRef);
        if (failure) {
            // Only a definite refusal is the provider's answer to this key; an unclear one is a
            // transport problem that never reached it.
            if (FINAL_REFUND_FAILURES.includes(failure))
                keyedAnswers.set(idempotencyKey, { at: Date.now(), failure });
            return Promise.reject(
                new PaymentProviderError(failure, `[fake-psp] simulated refund failure: ${failure}`)
            );
        }

        // The intent keeps its settled outcome: a real provider records a refund as its own object.
        // Stryker disable next-line all
        logger.info(
            `[fake-psp] refund ${charge.amount} ${charge.currency} on ${providerRef} (${idempotencyKey})`
        );
        // Derived from the key, like a real provider's idempotent replay: the same key answers
        // the same refund id. A key forgotten after its window makes a different one.
        const refundRef = known
            ? `re_fake_${idempotencyKey}_${String(refundsByRecord.size)}`
            : `re_fake_${idempotencyKey}`;
        const status = pendingRefundIntents.has(providerRef) ? 'pending' : 'succeeded';
        refundsByRecord.set(refundId, refundRef);
        refundObjects.set(refundRef, { providerRef, status, refundId });
        keyedAnswers.set(idempotencyKey, { at: Date.now(), refundRef, status });

        if (refundTimeouts.delete(providerRef))
            return Promise.reject(
                new PaymentProviderError(
                    'provider_unavailable',
                    '[fake-psp] simulated timeout: the refund ran, the answer was lost'
                )
            );
        return Promise.resolve({ refundRef, status });
    },

    retrieveRefund: (refundRef) => {
        const known = refundObjects.get(refundRef);
        // Stryker disable next-line all
        logger.info(`[fake-psp] retrieveRefund ${refundRef} → ${known?.status ?? 'unknown'}`);
        if (!known)
            return Promise.reject(
                new PaymentProviderError('unknown', `[fake-psp] no refund ${refundRef}`)
            );
        const { providerRef: _providerRef, ...state } = known;
        return Promise.resolve(state);
    },

    cancel: (providerRef, { reason }) => {
        if (cancelledIntents.has(providerRef)) {
            // Stryker disable next-line all
            logger.info(`[fake-psp] cancel ${providerRef} → already cancelled`);
            return Promise.resolve();
        }
        // Only `succeeded` is checked: `confirm` above writes STRAIGHT to the settled outcome
        // (see its own comment), so `outcomes` never actually rests on `processing` here — a real
        // provider's own intent can, and must refuse a cancel there too (see the port's own doc).
        if (outcomes.get(providerRef)?.status === 'succeeded') {
            // Stryker disable next-line all
            logger.info(`[fake-psp] cancel ${providerRef} refused → already succeeded`);
            return Promise.reject(
                new PaymentInFlightError(`Payment ${providerRef} already succeeded at the provider`)
            );
        }
        cancelledIntents.add(providerRef);
        // Stryker disable next-line all
        logger.info(`[fake-psp] cancel ${providerRef} (${reason})`);
        return Promise.resolve();
    },

    /**
     * The fake's deliveries carry this module's own normalised event shape — a real provider's
     * implementation is where its native event names are translated into it. The signature is
     * verified exactly as a real one's would be, so the route's defences are exercised for real.
     *
     * The body is NOT validated here: the port parses every adapter's event against the contract's
     * schema before any lookup (`applyWebhookDelivery`), so this double relies on it exactly as a
     * real adapter may. `strictQuery` drops unknown query paths but does nothing for a JSON body,
     * and that parse is the only guard against `{ "$ne": null }` standing where a `providerRef`
     * string belongs.
     */
    parseWebhook: (rawBody, headers: IncomingHttpHeaders) =>
        // Inside the chain rather than in front of it: a synchronous throw from a method typed as
        // returning a promise makes every caller need a try/catch as well as a `.catch`.
        Promise.resolve()
            .then(() =>
                verifyWebhookSignature(
                    rawBody,
                    // One value: a repeated header arrives as an array, which verifies as malformed.
                    String(headers[WEBHOOK_SIGNATURE_HEADER] ?? '')
                )
            )
            .then(() => rawBody.toString('utf8'))
            // `JSON.parse` throws, and the throw lands in this chain's own rejection — so the
            // `.catch` below is what turns an unparseable body into the 400 it is, rather than
            // letting it read as a fault of ours.
            .then((text): unknown => JSON.parse(text))
            .catch((error: unknown) => {
                if (error instanceof WebhookRejected) throw error;
                throw new WebhookRejected('Body is not valid JSON');
            })
            // One cast, on purpose: the JSON is unvalidated and the port's parse is what refuses
            // a body of the wrong shape.
            .then((body) => body as ProviderWebhookEvent)
};
