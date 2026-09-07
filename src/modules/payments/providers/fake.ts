/**
 * @module
 * The fake PSP — a provider that never talks to the outside world, but imposes the same shape a
 * real one does: it hands back an intent reference the browser finishes against, it answers with
 * the asynchronous states (`requires_action`, `processing`) as well as the terminal ones, and it
 * signs its webhooks. That is what lets the demo and every e2e walk the 3-D Secure and the
 * webhook paths without an account anywhere.
 *
 * The method references below mirror the shape of a real provider's test tokens: an opaque
 * handle the browser produced, never a card number.
 */

import { createHmac } from 'node:crypto';
import { logger } from '@infrastructure/adapters/logger';
import { verifyWebhookSignature, WebhookSignatureError } from './webhook-signature';
import type { PaymentProvider, ProviderPaymentState, ProviderPaymentStatus } from './index';

/** The webhook body as it arrives — the contract's `PaymentWebhookEvent`, flat. */
interface PaymentWebhookEventBody {
    id?: string;
    providerRef?: string;
    status?: ProviderPaymentStatus;
    cardLast4?: string;
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
    prepare: (charge, metadata) => {
        const providerRef = `fake_pi_${metadata.paymentId}`;
        logger.info(
            `[fake-psp] prepare ${charge.amount} ${charge.currency} for order ${metadata.orderId} → ${providerRef}`
        );
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
        logger.info(
            `[fake-psp] confirm ${providerRef} with ****${state.cardLast4} → ${state.status}`
        );
        return Promise.resolve(state);
    },

    retrieve: (providerRef) => {
        const state = outcomes.get(providerRef) ?? { status: 'processing' as const };
        logger.info(`[fake-psp] retrieve ${providerRef} → ${state.status}`);
        return Promise.resolve(state);
    },

    refund: (providerRef, charge) => {
        outcomes.delete(providerRef);
        logger.info(`[fake-psp] refund ${charge.amount} ${charge.currency} on ${providerRef}`);
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
                if (error instanceof WebhookSignatureError) throw error;
                throw new WebhookSignatureError('Body is not valid JSON');
            })
            .then((event) => {
                if (!event.id) throw new WebhookSignatureError('Event carries no id');
                // The wire shape is flat; `ProviderPaymentState` is the shape the SERVICE reads.
                // Assembling it here is the whole job of an adapter — a real provider builds the
                // same object out of its own nested event instead.
                return {
                    id: event.id,
                    providerRef: event.providerRef,
                    state: event.status
                        ? { status: event.status, cardLast4: event.cardLast4 }
                        : undefined
                };
            })
};
