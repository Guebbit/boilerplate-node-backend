/**
 * The payment provider port — the seam a real PSP plugs into.
 *
 * The module's service talks to this interface and nothing else: amounts, cards and refunds go
 * through it, and which implementation answers is a deployment decision (`NODE_PAYMENT_PROVIDER`),
 * not a code path. The boilerplate ships `fake` (see `./fake`); a project that goes live writes
 * `stripe.ts` beside it, adds one line to the registry below, and changes one env var — the
 * contract, the service and the frontend never hear about it.
 *
 * Same shape as `ImageStore` in `@infrastructure/adapters/image-store`, with the selection made
 * env-driven the way the mailer picks its transport: read lazily inside the function (tests vary
 * the environment per case), memoised, with a `reset` seam.
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
     * @returns the outcome — a decline is an answer, not an error; only transport-level
     *   failures throw
     */
    charge(charge: { amount: number; currency: string }, card: CardDetails): Promise<ChargeOutcome>;

    /**
     * Return the money of a succeeded charge. Idempotent at the provider's side; the caller
     * guards its own side by only refunding a `succeeded` payment.
     */
    refund(charge: { amount: number; currency: string }): Promise<void>;
}

/** Every implementation this build knows. A typo'd env value must fail loudly, not fall back. */
const PROVIDERS: Record<string, PaymentProvider> = {
    fake: fakePaymentProvider
};

let provider: PaymentProvider | undefined;

/**
 * The configured provider, memoised on first use.
 *
 * @returns the implementation `NODE_PAYMENT_PROVIDER` names (default `fake`)
 * @throws when the env names a provider this build does not carry — a deployment
 *   misconfiguration that must surface at the first payment, not as silent fake charges
 */
export const resolvePaymentProvider = (): PaymentProvider => {
    if (provider) return provider;
    const name = process.env.NODE_PAYMENT_PROVIDER ?? 'fake';
    const resolved = PROVIDERS[name] as (typeof PROVIDERS)[string] | undefined;
    if (!resolved)
        throw new Error(
            `Unknown payment provider "${name}" — known: ${Object.keys(PROVIDERS).join(', ')}`
        );
    provider = resolved;
    return provider;
};

/** Test seam, like the mailer's `resetTransporter`. */
export const resetPaymentProvider = (): void => {
    provider = undefined;
};
