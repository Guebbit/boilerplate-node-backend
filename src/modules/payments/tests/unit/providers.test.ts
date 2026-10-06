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

/** The header a provider holding exactly `secret` would send for `payload`. */
const signedWith = (secret: string, payload: Buffer, timestamp?: number): string => {
    setEnvironment({ NODE_PAYMENT_WEBHOOK_SECRET: secret });
    return signWebhookPayload(payload, timestamp);
};

/** The `v1=<hex>` part of a header. */
const v1Of = (header: string): string => /v1=[0-9a-f]+/u.exec(header)![0];

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

    describe('a ring of secrets, for rotating the provider key', () => {
        const OLD = 'old-payment-webhook-secret';
        const NEW = 'new-payment-webhook-secret';

        it('signs with the first entry', () => {
            const header = signedWith(`${NEW},${OLD}`, body);

            // Verifiable by a ring holding only the new secret: the first entry signed it.
            setEnvironment({ NODE_PAYMENT_WEBHOOK_SECRET: NEW });
            expect(() => verifyWebhookSignature(body, header)).not.toThrow();
            setEnvironment({ NODE_PAYMENT_WEBHOOK_SECRET: OLD });
            expect(() => verifyWebhookSignature(body, header)).toThrow(WebhookRejected);
        });

        it('verifies a delivery signed with any entry of the ring', () => {
            const oldHeader = signedWith(OLD, body);
            const newHeader = signedWith(NEW, body);

            setEnvironment({ NODE_PAYMENT_WEBHOOK_SECRET: `${NEW},${OLD}` });

            expect(() => verifyWebhookSignature(body, oldHeader)).not.toThrow();
            expect(() => verifyWebhookSignature(body, newHeader)).not.toThrow();
        });

        it('accepts two v1 values, one per secret, when either secret is still in the ring', () => {
            const timestamp = Math.floor(Date.now() / 1000);
            const both = `t=${timestamp},${v1Of(signedWith(OLD, body, timestamp))},${v1Of(signedWith(NEW, body, timestamp))}`;

            for (const ring of [OLD, NEW, `${NEW},${OLD}`]) {
                setEnvironment({ NODE_PAYMENT_WEBHOOK_SECRET: ring });
                expect(() => verifyWebhookSignature(body, both)).not.toThrow();
            }
        });

        it('accepts the matching v1 wherever it sits among forged ones', () => {
            const timestamp = Math.floor(Date.now() / 1000);
            const genuine = v1Of(signedWith(NEW, body, timestamp));
            const forged = `v1=${'0'.repeat(64)}`;

            // Today a Map kept the LAST v1, so a forged one after the genuine one refused it.
            expect(() =>
                verifyWebhookSignature(body, `t=${timestamp},${genuine},${forged}`)
            ).not.toThrow();
            expect(() =>
                verifyWebhookSignature(body, `t=${timestamp},${forged},${genuine}`)
            ).not.toThrow();
        });

        it('refuses when none of the v1 values matches any secret of the ring', () => {
            const timestamp = Math.floor(Date.now() / 1000);
            const stranger = v1Of(signedWith('someone-elses-webhook-secret', body, timestamp));
            setEnvironment({ NODE_PAYMENT_WEBHOOK_SECRET: `${NEW},${OLD}` });

            expect(() =>
                verifyWebhookSignature(body, `t=${timestamp},${stranger},v1=${'1'.repeat(64)}`)
            ).toThrow(WebhookRejected);
        });

        it('trims the entries, so a space after a comma is not part of the secret', () => {
            const header = signedWith(OLD, body);

            setEnvironment({ NODE_PAYMENT_WEBHOOK_SECRET: `${NEW}, ${OLD}` });

            expect(() => verifyWebhookSignature(body, header)).not.toThrow();
        });

        it('refuses an empty v1', () => {
            const timestamp = Math.floor(Date.now() / 1000);

            expect(() => verifyWebhookSignature(body, `t=${timestamp},v1=`)).toThrow(
                'Malformed signature header'
            );
        });
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
