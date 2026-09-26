/**
 * This module's own boot gate for `NODE_PAYMENT_PROVIDER` — `resolvePaymentProvider`
 * (`../../providers`) already throws a good message on an unknown name; this is what makes that
 * throw happen at boot instead of on the first payment.
 *
 * `validateBankTransferConfig`'s own cases live in `config.test.ts`; this file is only the
 * provider-selector half of the manifest's combined `customCheck`.
 *
 * Every case sets `NODE_ENV` away from `test` first: the gate short-circuits under the test
 * environment, so a suite that left it alone would assert nothing.
 */
import { assertRequiredConfig } from '@kernel/required-config';
import { withoutEnvironmentInThisFile } from '@tests/environment';
import paymentsModule from '../../module';

withoutEnvironmentInThisFile(['NODE_ENV', 'NODE_PAYMENT_PROVIDER', 'NODE_STRIPE_SECRET_KEY']);

/** A deployment that satisfies every unconditional check, for a case to break one thing in. */
const configure = (): void => {
    process.env.NODE_ENV = 'development';
};

describe('the payment provider selector', () => {
    it('accepts an unset NODE_PAYMENT_PROVIDER — fake, the default', () => {
        configure();

        expect(() => assertRequiredConfig([paymentsModule])).not.toThrow();
    });

    it('accepts the shipped fake provider named explicitly', () => {
        configure();
        process.env.NODE_PAYMENT_PROVIDER = 'fake';

        expect(() => assertRequiredConfig([paymentsModule])).not.toThrow();
    });

    it('refuses an unrecognized NODE_PAYMENT_PROVIDER at boot, not the first payment', () => {
        configure();
        process.env.NODE_PAYMENT_PROVIDER = 'not-a-provider';

        expect(() => assertRequiredConfig([paymentsModule])).toThrow(/NODE_PAYMENT_PROVIDER/);
    });
});

/**
 * The Stripe secret key gate's own boot wiring. `validateStripeSecretKey`'s pure cases (no key,
 * live key, test key outside production) live in `config.test.ts` — this is only the one case
 * that proves the module's manifest actually WIRES it into `assertRequiredConfig`: a build that
 * forgot the wiring would not throw here either, and the other three cases wouldn't tell.
 */
describe('the Stripe secret key gate', () => {
    it('refuses to boot in production with a test-mode key', () => {
        process.env.NODE_ENV = 'production';
        process.env.NODE_STRIPE_SECRET_KEY = 'sk_test_abc123';

        expect(() => assertRequiredConfig([paymentsModule])).toThrow(/NODE_STRIPE_SECRET_KEY/);
    });
});
