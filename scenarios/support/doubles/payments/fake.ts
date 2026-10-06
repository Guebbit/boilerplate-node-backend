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
import { logger } from '@infrastructure/adapters/logger';
import {
    PaymentInFlightError,
    verifyWebhookSignature,
    WebhookRejected,
    type PaymentProvider,
    type ProviderPaymentState
} from '@modules/payments/providers';

/** The webhook body as it arrives — the contract's `PaymentWebhookEvent`: a thin event. */
interface PaymentWebhookEventBody {
    id?: string;
    providerRef?: string;
}

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
        return Promise.resolve(state);
    },

    retrieve: (providerRef) => {
        const state = outcomes.get(providerRef) ?? { status: 'processing' as const };
        // Stryker disable next-line all
        logger.info(`[fake-psp] retrieve ${providerRef} → ${state.status}`);
        return Promise.resolve(state);
    },

    // This fake never leaves the process, so there is no second network attempt to deduplicate —
    // a real provider's own client sends `idempotencyKey` as a request header instead.
    refund: (providerRef, charge, { idempotencyKey }) => {
        outcomes.delete(providerRef);
        // Stryker disable next-line all
        logger.info(
            `[fake-psp] refund ${charge.amount} ${charge.currency} on ${providerRef} (${idempotencyKey})`
        );
        // Derived from the key, like a real provider's idempotent replay: the same key answers
        // the same refund id.
        return Promise.resolve({ refundRef: `re_fake_${idempotencyKey}` });
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
     */
    parseWebhook: (rawBody, signature) =>
        // Inside the chain rather than in front of it: a synchronous throw from a method typed as
        // returning a promise makes every caller need a try/catch as well as a `.catch`.
        Promise.resolve()
            .then(() => verifyWebhookSignature(rawBody, signature))
            .then(() => rawBody.toString('utf8'))
            // `JSON.parse` throws, and the throw lands in this chain's own rejection — so the
            // `.catch` below is what turns an unparseable body into the 400 it is, rather than
            // letting it read as a fault of ours.
            .then((text) => JSON.parse(text) as PaymentWebhookEventBody)
            .catch((error: unknown) => {
                if (error instanceof WebhookRejected) throw error;
                throw new WebhookRejected('Body is not valid JSON');
            })
            .then((event) => {
                if (!event.id) throw new WebhookRejected('Event carries no id');
                // Thin: which event, which intent. What happened to it is `retrieve`'s answer.
                return { id: event.id, providerRef: event.providerRef };
            })
};
