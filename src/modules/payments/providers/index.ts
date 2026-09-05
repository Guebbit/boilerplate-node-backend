/**
 * @module
 * The payment provider port — the seam a real PSP plugs into. Which implementation answers is a
 * deployment decision (`NODE_PAYMENT_PROVIDER`), not a code path; the boilerplate ships `fake`
 * and a live project adds `stripe.ts` plus one line to the registry below. Selection is read
 * lazily and memoised, env-driven like the mailer's transport pick.
 */

import { fakePaymentProvider } from './fake';
import type { CardDetails } from './card';

export { cardLastFour, type CardDetails } from './card';

/** What a charge attempt can come back as. Everything else a provider can say is a throw. */
export type ChargeOutcome = 'succeeded' | 'declined';

export interface PaymentProvider {
    /** The name persisted on each payment document, so a row says who handled it. */
    name: string;

    /**
     * Attempt to take the money.
     *
     * @param charge - the frozen amount and its currency
     * @param card - the customer's card
     * @returns the outcome; a decline is an answer, not an error — only transport failures throw
     */
    charge(charge: { amount: number; currency: string }, card: CardDetails): Promise<ChargeOutcome>;

    /**
     * Return the money of a succeeded charge. Idempotent at the provider's side; the caller
     * guards its own side by only refunding a `succeeded` payment.
     */
    refund(charge: { amount: number; currency: string }): Promise<void>;
}

/** Every implementation this build knows. A real deployment adds `stripe.ts` and one line here. */
const PROVIDERS: Record<string, PaymentProvider> = {
    fake: fakePaymentProvider
};

/** Memoised on first call by {@link resolvePaymentProvider}; `undefined` until then. */
let provider: PaymentProvider | undefined;

/**
 * The configured provider, memoised on first use.
 *
 * A typo'd `NODE_PAYMENT_PROVIDER` resolves to `undefined` and the first `.charge()` throws on it —
 * loud, without a bespoke message saying the same thing.
 *
 * @returns the implementation `NODE_PAYMENT_PROVIDER` names (default `fake`)
 */
export const resolvePaymentProvider = (): PaymentProvider => {
    provider ??= PROVIDERS[process.env.NODE_PAYMENT_PROVIDER ?? 'fake'];
    return provider;
};
