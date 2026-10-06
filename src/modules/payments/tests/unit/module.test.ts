/**
 * This module's own boot gate for `NODE_PAYMENT_PROVIDER` — `resolvePaymentProvider`
 * (`../../providers`) already throws a good message on an unknown name; this is what makes that
 * throw happen at boot instead of on the first payment.
 *
 * `validateBankTransferConfig`'s own cases live in `config.test.ts`; this file is only the
 * provider-selector half of the manifest's combined slice check.
 *
 * Every case sets `NODE_ENV` away from `test` first: the gate short-circuits under the test
 * environment, so a suite that left it alone would assert nothing.
 */
import { assertModuleConfig } from '@kernel/module-config';
import { withoutEnvironmentInThisFile, setEnvironment } from '@tests/environment';
import paymentsModule from '../../module';

withoutEnvironmentInThisFile([
    'NODE_ENV',
    'NODE_PAYMENT_PROVIDER',
    'NODE_PAYMENT_WEBHOOK_SECRET',
    'NODE_STRIPE_SECRET_KEY'
]);

/** A deployment that satisfies every unconditional check, for a case to break one thing in. */
const configure = (): void => {
    setEnvironment({ NODE_ENV: 'development' });
};

describe('the payment provider selector', () => {
    it('accepts an unset NODE_PAYMENT_PROVIDER: no card payments, not an error', () => {
        configure();

        expect(() => assertModuleConfig([paymentsModule], [])).not.toThrow();
    });

    it('accepts a registered provider named explicitly', () => {
        configure();
        setEnvironment({ NODE_PAYMENT_PROVIDER: 'fake' });

        expect(() => assertModuleConfig([paymentsModule], [])).not.toThrow();
    });

    it('refuses an unrecognized NODE_PAYMENT_PROVIDER at boot, not the first payment', () => {
        configure();
        setEnvironment({ NODE_PAYMENT_PROVIDER: 'not-a-provider' });

        expect(() => assertModuleConfig([paymentsModule], [])).toThrow(/NODE_PAYMENT_PROVIDER/);
    });
});

/**
 * The webhook secret is optional (no provider, nothing to sign) but is never weak or a
 * placeholder once set.
 */
describe('the payment webhook secret', () => {
    it('may stay unset, in production too', () => {
        setEnvironment({ NODE_ENV: 'production' });

        expect(() => assertModuleConfig([paymentsModule], [])).not.toThrow();
    });

    it('refuses a value under 16 characters', () => {
        configure();
        setEnvironment({ NODE_PAYMENT_WEBHOOK_SECRET: 'too-short' });

        expect(() => assertModuleConfig([paymentsModule], [])).toThrow(
            /NODE_PAYMENT_WEBHOOK_SECRET/
        );
    });

    it('accepts a ring of secrets, every entry long enough', () => {
        configure();
        setEnvironment({
            NODE_PAYMENT_WEBHOOK_SECRET: 'new-payment-webhook-secret,old-payment-webhook-secret'
        });

        expect(() => assertModuleConfig([paymentsModule], [])).not.toThrow();
    });

    it('refuses a ring whose second entry is under 16 characters', () => {
        configure();
        setEnvironment({ NODE_PAYMENT_WEBHOOK_SECRET: 'new-payment-webhook-secret,short' });

        expect(() => assertModuleConfig([paymentsModule], [])).toThrow(
            /NODE_PAYMENT_WEBHOOK_SECRET/
        );
    });

    it('refuses a trailing comma: an empty entry is no secret', () => {
        configure();
        setEnvironment({ NODE_PAYMENT_WEBHOOK_SECRET: 'new-payment-webhook-secret,' });

        expect(() => assertModuleConfig([paymentsModule], [])).toThrow(
            /NODE_PAYMENT_WEBHOOK_SECRET/
        );
    });

    it('refuses the .env-example placeholder in production', () => {
        setEnvironment({ NODE_ENV: 'production' });
        setEnvironment({ NODE_PAYMENT_WEBHOOK_SECRET: 'your-payment-webhook-secret-here' });

        expect(() => assertModuleConfig([paymentsModule], [])).toThrow(
            /NODE_PAYMENT_WEBHOOK_SECRET/
        );
    });
});

/**
 * The Stripe secret key gate's own boot wiring. `validateStripeSecretKey`'s pure cases (no key,
 * live key, test key outside production) live in `config.test.ts` — this is only the one case
 * that proves the module's manifest actually WIRES it into `assertModuleConfig`: a build that
 * forgot the wiring would not throw here either, and the other three cases wouldn't tell.
 */
describe('the Stripe secret key gate', () => {
    it('refuses to boot in production with a test-mode key', () => {
        setEnvironment({ NODE_ENV: 'production' });
        setEnvironment({ NODE_STRIPE_SECRET_KEY: 'sk_test_abc123' });

        expect(() => assertModuleConfig([paymentsModule], [])).toThrow(/NODE_STRIPE_SECRET_KEY/);
    });
});
