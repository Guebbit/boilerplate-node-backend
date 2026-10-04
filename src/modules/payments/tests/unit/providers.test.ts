/**
 * @module
 * The payment provider port — selection by `NODE_PAYMENT_PROVIDER` and the webhook signature
 * discipline every provider shares — `src/modules/payments/providers/`. No mocks, no database:
 * `service.test.ts` lives in `tests/integration/` instead, because it persists a payment document.
 * The `fake` provider's own outcome logic is a double, tested in `tests/unit/scenarios/`.
 */

import {
    signWebhookPayload,
    verifyWebhookSignature,
    WebhookRejected
} from '../../providers/webhook-signature';
import { resetEnvironment, setEnvironment } from '@tests/environment';

describe('webhook signatures', () => {
    const body = Buffer.from(JSON.stringify({ id: 'evt_1' }), 'utf8');

    it('accepts a signature it produced itself', () => {
        expect(() => verifyWebhookSignature(body, signWebhookPayload(body))).not.toThrow();
    });

    it('refuses a body that changed after signing', () => {
        const signature = signWebhookPayload(body);

        expect(() =>
            verifyWebhookSignature(Buffer.from(JSON.stringify({ id: 'evt_2' })), signature)
        ).toThrow(WebhookRejected);
    });

    it('refuses a signature signed with another secret', () => {
        setEnvironment({ NODE_PAYMENT_WEBHOOK_SECRET: 'someone-elses-secret' });
        const forged = signWebhookPayload(body);
        resetEnvironment();

        expect(() => verifyWebhookSignature(body, forged)).toThrow(WebhookRejected);
    });

    it('refuses a replay from outside the tolerance window, signature or not', () => {
        const stale = signWebhookPayload(body, Math.floor(Date.now() / 1000) - 3600);

        expect(() => verifyWebhookSignature(body, stale)).toThrow(WebhookRejected);
    });

    it('refuses a malformed header', () => {
        expect(() => verifyWebhookSignature(body, 'not-a-signature')).toThrow(WebhookRejected);
        expect(() => verifyWebhookSignature(body, undefined)).toThrow(WebhookRejected);
    });

    it('refuses a signature of the wrong length without throwing something else', () => {
        expect(() => verifyWebhookSignature(body, 't=1,v1=ab')).toThrow(WebhookRejected);
    });

    it('accepts an uppercase-hex signature identically to the lowercase form', () => {
        const header = signWebhookPayload(body);
        // Only the digest half of `v1=<hex>` is upper-cased — `t=` stays a plain decimal timestamp.
        const uppercased = header.replace(
            /v1=([0-9a-f]+)/u,
            (_match, hex: string) => `v1=${hex.toUpperCase()}`
        );

        expect(() => verifyWebhookSignature(body, uppercased)).not.toThrow();
    });
});

/** Re-imports the provider registry with a fresh module scope. */
const loadResolver = async () => {
    jest.resetModules();
    const module_ = await import('../../providers/index');
    return module_.resolvePaymentProvider;
};

describe('resolvePaymentProvider', () => {
    afterEach(() => {
        jest.resetModules();
    });

    it('answers no provider when none is configured: card payments are off', async () => {
        setEnvironment({ NODE_PAYMENT_PROVIDER: undefined });
        const resolvePaymentProvider = await loadResolver();

        expect(resolvePaymentProvider()).toBeUndefined();
    });

    it('honours an explicit registered provider', async () => {
        setEnvironment({ NODE_PAYMENT_PROVIDER: 'fake' });
        const resolvePaymentProvider = await loadResolver();

        expect(resolvePaymentProvider()?.name).toBe('fake');
    });

    it('refuses a name this process does not have, rather than falling back', async () => {
        // A typo'd variable must not quietly turn card payments off, or onto another provider.
        setEnvironment({ NODE_PAYMENT_PROVIDER: 'stripe' });
        const resolvePaymentProvider = await loadResolver();

        expect(() => resolvePaymentProvider()).toThrow(/stripe/u);
    });
});
