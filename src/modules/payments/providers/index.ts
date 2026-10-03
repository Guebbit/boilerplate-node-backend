/**
 * @module
 * The payment provider port — the seam a real PSP plugs into. Which implementation answers is a
 * deployment decision (`NODE_PAYMENT_PROVIDER`), not a code path; the boilerplate ships `fake`
 * and a live project adds one file plus one line to the registry below.
 *
 * The shape is the one every real PSP imposes: the card never reaches this server, an intent is
 * prepared before anything is charged, and the authoritative answer arrives asynchronously by
 * webhook. See `docs/modules/payments.md` for why that is not negotiable.
 */

import { createProviderRegistry, requireProvider } from '@infrastructure/runtime/provider-registry';
import { defineConfig, probe } from '@infrastructure/config/define';
import { paymentsConfig } from '../config';
import { fakePaymentProvider } from './fake';

/** Re-exported from `./errors` — see there for why it isn't declared in this file. */
export { PaymentInFlightError } from './errors';

export {
    signWebhookPayload,
    verifyWebhookSignature,
    WEBHOOK_SIGNATURE_HEADER,
    WebhookRejected
} from './webhook-signature';

/** What the money is doing at the provider. `refunded` is ours, not theirs — it is a later act. */
export type ProviderPaymentStatus = 'requires_action' | 'processing' | 'succeeded' | 'declined';

/** What a provider says about one intent, whether asked directly or through a webhook. */
export interface ProviderPaymentState {
    status: ProviderPaymentStatus;
    /**
     * The only card digits a payment system may remember. Comes from the PROVIDER — this server
     * never sees a card number, so it has no way to derive them itself.
     */
    cardLast4?: string;
}

/** What `prepare` hands back: the reference we persist, and the secret the browser finishes with. */
export interface PreparedPayment {
    /** The provider's own id for this intent (`pi_…`), persisted as the webhook's lookup key. */
    providerRef: string;
    /**
     * Handed to the browser so it can complete a challenge against the provider directly. NEVER
     * persisted, logged or audited: it authorises completing this payment.
     */
    clientSecret?: string;
}

/** What a provider answers once it has returned money: its own id for the refund. */
export interface RefundedByProvider {
    /** The provider's refund id (`re_…`), kept on the refund record for reconciliation. */
    refundRef: string;
}

/** A webhook delivery, normalised — the provider owns the translation from its own event shape. */
export interface ProviderWebhookEvent {
    /** The provider's event id, deduplicated so a retried delivery settles nothing twice. */
    id: string;
    /** Which intent it is about; `undefined` for an event this application does not act on. */
    providerRef?: string;
    /** The state it reports, absent when the event is one we ignore. */
    state?: ProviderPaymentState;
}

/**
 * What an implementation must provide — and, for a REAL one, what it must additionally defend.
 *
 * `fake` never leaves the process, which is the only reason callback forgery and callback replay
 * read as "no surface" here. A live PSP sends THIS server the request that decides an order is
 * paid: {@link PaymentProvider.parseWebhook} must verify the provider's signature over the raw
 * body and trust no payment status reported by the browser.
 *
 * See: docs/theory/defences/business-logic.md
 */
export interface PaymentProvider {
    /** The name persisted on each payment document, so a row says who handled it. */
    name: string;

    /**
     * Open an intent at the provider for an amount already frozen by this application.
     *
     * Idempotent on `metadata.paymentId`: the double-click case must answer the same intent
     * rather than opening a second one the customer could also pay.
     *
     * @param charge - the frozen amount and its currency
     * @param metadata - what to stamp on the provider's own record, for support and reconciliation
     */
    prepare(
        charge: { amount: number; currency: string },
        metadata: { orderId: string; paymentId: string }
    ): Promise<PreparedPayment>;

    /**
     * Attach a payment method the browser tokenised and ask the provider to take the money.
     *
     * @param providerRef - what {@link prepare} returned
     * @param paymentMethodRef - the provider's opaque handle for the card (`pm_…`). NOT a card
     *   number: a server that receives one of those is in the wrong PCI bracket.
     * @returns the state the provider reached; a decline is an answer, only transport failures throw
     */
    confirm(providerRef: string, paymentMethodRef: string): Promise<ProviderPaymentState>;

    /**
     * Read the authoritative state back. The reconciliation path, and what the browser's "I have
     * finished the challenge" call settles against.
     *
     * @param providerRef - what {@link prepare} returned
     */
    retrieve(providerRef: string): Promise<ProviderPaymentState>;

    /**
     * Return money of a succeeded charge — all of it, or a part.
     *
     * `charge.amount` is what to return THIS time, not what was paid; more than one refund can
     * stand against the same charge until they add up to it.
     *
     * `idempotencyKey` is what makes a RETRY of this call safe at the provider, not just at this
     * application: two calls carrying the same key (`refund:{paymentId}`) return the same refund
     * rather than returning the money twice — Stripe's own idempotency keys work this way. The
     * caller's own conditional `succeeded → refunded` write is the other half, for the case where
     * this application's two callers never reach the provider at the same time to begin with.
     */
    refund(
        providerRef: string,
        charge: { amount: number; currency: string },
        idempotency: { idempotencyKey: string }
    ): Promise<RefundedByProvider>;

    /**
     * Close an intent that has not succeeded yet — the customer abandoned it, or this application
     * is recording the money another way instead. The counterpart to `prepare`.
     *
     * Idempotent: a provider that already considers the intent cancelled answers success, since
     * the caller's own goal — nothing left open — already holds. Every reference platform allows
     * this from any pre-success state; Stripe's own `PaymentIntent`s never expire on their own,
     * which is why this exists at all.
     *
     * @param providerRef - what {@link prepare} returned
     * @param reason - recorded at the provider, for support and reconciliation
     * @throws {PaymentInFlightError} when the intent already succeeded or is still mid-flight —
     *   there is money to refund instead, not an intent left to cancel
     */
    cancel(providerRef: string, { reason }: { reason: string }): Promise<void>;

    /**
     * Turn a raw webhook delivery into an event this module can act on.
     *
     * Takes the UNPARSED body: a signature is computed over exact bytes, and a re-serialised
     * object is not those bytes. `src/app/security.ts` keeps the buffer for this route alone.
     *
     * @param rawBody - the request body as received
     * @param signature - the provider's signature header, verbatim
     * @throws {WebhookRejected} when the signature does not verify, the body is not valid JSON, or
     *   the parsed event carries no id — the caller answers 400 in all three cases, because a
     *   delivery this application cannot authenticate or make sense of is not an event
     */
    parseWebhook(rawBody: Buffer, signature: string): Promise<ProviderWebhookEvent>;
}

/**
 * Every implementation this build knows. A live deployment adds one file and calls
 * {@link registerPaymentProvider} — no edit here required.
 */
const registry = createProviderRegistry<PaymentProvider>({
    fake: fakePaymentProvider
});

/** Add (or, in a test, override) one implementation without editing this file. */
export const registerPaymentProvider = (name: string, provider: PaymentProvider): void =>
    registry.register(name, provider);

/**
 * The configured provider, read fresh per call rather than memoised — a registry lookup costs less
 * than the branch that would cache it, and the antibot ladder reads its own env fresh too.
 *
 * @returns the implementation `NODE_PAYMENT_PROVIDER` names (default `fake`)
 * @throws {Error} when the variable names an implementation this build does not have; falling back
 *   to `fake` would turn a deployment's typo into an order marked paid that nobody was charged for
 */
export const resolvePaymentProvider = (): PaymentProvider => {
    return requireProvider(
        registry,
        'NODE_PAYMENT_PROVIDER',
        paymentsConfig().NODE_PAYMENT_PROVIDER
    );
};

/**
 * The implementation a PAYMENT'S OWN `provider` field names — for confirming, syncing or
 * refunding a payment already made, which must go back to whichever provider actually took the
 * money. `resolvePaymentProvider` answers a different question — which provider a NEW
 * intent opens under — and the two must not be conflated: a deployment that switches
 * `NODE_PAYMENT_PROVIDER` must not silently redirect an old payment's refund to the new one.
 *
 * @param name - a payment's own `provider` field
 * @throws {Error} when this build has no implementation registered under that name — dormant
 *   today (only `fake` is ever written), live the day a second provider is added and a deployment
 *   switches
 */
export const providerNamed = (name: string): PaymentProvider => {
    const provider = registry.resolve(name);
    if (!provider) throw new Error(`Unknown payment provider: ${name}`);
    return provider;
};

/**
 * Boot probe for `NODE_PAYMENT_PROVIDER`: a typo would otherwise throw on the first payment, in the
 * middle of a checkout. A shape-less slice, because the resolver imports the config and the
 * config therefore cannot import the resolver.
 */
export const paymentProviderProbe = defineConfig({
    name: 'payments-provider',
    shape: {},
    check: () => probe(resolvePaymentProvider)
});
