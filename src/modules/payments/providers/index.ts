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

import { fakePaymentProvider } from './fake';

export {
    signWebhookPayload,
    verifyWebhookSignature,
    WEBHOOK_SIGNATURE_HEADER,
    WebhookSignatureError
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
 * See: docs/theory/web-attack-defences.md
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
     * Return the money of a succeeded charge. Idempotent at the provider's side; the caller guards
     * its own side by only refunding a `succeeded` payment.
     */
    refund(providerRef: string, charge: { amount: number; currency: string }): Promise<void>;

    /**
     * Turn a raw webhook delivery into an event this module can act on.
     *
     * Takes the UNPARSED body: a signature is computed over exact bytes, and a re-serialised
     * object is not those bytes. `src/app/security.ts` keeps the buffer for this route alone.
     *
     * @param rawBody - the request body as received
     * @param signature - the provider's signature header, verbatim
     * @throws {WebhookSignatureError} when the signature does not verify — the caller answers 400,
     *   because a body nobody can authenticate is not an event
     */
    parseWebhook(rawBody: Buffer, signature: string): Promise<ProviderWebhookEvent>;
}

/** Every implementation this build knows. A real deployment adds one file and one line here. */
const PROVIDERS: Record<string, PaymentProvider | undefined> = {
    fake: fakePaymentProvider
};

/**
 * The configured provider, read fresh per call rather than memoised — a registry lookup costs less
 * than the branch that would cache it, and the antibot ladder reads its own env fresh too.
 *
 * @returns the implementation `NODE_PAYMENT_PROVIDER` names (default `fake`)
 * @throws {Error} when the variable names an implementation this build does not have; falling back
 *   to `fake` would turn a deployment's typo into an order marked paid that nobody was charged for
 */
export const resolvePaymentProvider = (): PaymentProvider => {
    const name = process.env.NODE_PAYMENT_PROVIDER ?? 'fake';
    const provider = PROVIDERS[name];
    if (!provider) throw new Error(`Unknown NODE_PAYMENT_PROVIDER: "${name}"`);
    return provider;
};
