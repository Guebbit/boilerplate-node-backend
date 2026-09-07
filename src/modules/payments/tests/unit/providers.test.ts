/**
 * @module
 * The payment provider port, its `fake` implementation, and the webhook signature discipline every
 * provider shares — `src/modules/payments/providers/`. No mocks, no database: `service.test.ts`
 * moved to `tests/integration/` because it persists a payment document, while provider selection,
 * the fake PSP's outcome logic and signature verification don't touch Mongo and belong here.
 */

import {
    FAKE_DECLINE_METHOD,
    FAKE_SUCCESS_METHOD,
    fakePaymentProvider
} from '../../providers/fake';
import {
    signWebhookPayload,
    verifyWebhookSignature,
    WebhookSignatureError
} from '../../providers/webhook-signature';

const charge = { amount: 1000, currency: 'eur' };
const metadata = { orderId: 'order-1', paymentId: 'payment-1' };

describe('fakePaymentProvider.prepare', () => {
    it('derives the reference from the payment, so re-preparing answers the same intent', async () => {
        const first = await fakePaymentProvider.prepare(charge, metadata);
        const second = await fakePaymentProvider.prepare(charge, metadata);

        expect(first.providerRef).toBe(second.providerRef);
        expect(first.clientSecret).toBe(second.clientSecret);
    });

    it('gives different payments different references', async () => {
        const first = await fakePaymentProvider.prepare(charge, metadata);
        const second = await fakePaymentProvider.prepare(charge, {
            ...metadata,
            paymentId: 'payment-2'
        });

        expect(first.providerRef).not.toBe(second.providerRef);
    });

    it('hands back a client secret that is not the reference itself', async () => {
        const { providerRef, clientSecret } = await fakePaymentProvider.prepare(charge, metadata);

        expect(clientSecret).toBeDefined();
        expect(clientSecret).not.toBe(providerRef);
    });
});

describe('fakePaymentProvider.confirm', () => {
    it('declines the documented decline method', async () => {
        const state = await fakePaymentProvider.confirm('fake_pi_a', FAKE_DECLINE_METHOD);

        expect(state.status).toBe('declined');
    });

    it('asks for a challenge on the authentication method', async () => {
        const state = await fakePaymentProvider.confirm(
            'fake_pi_b',
            'pm_card_authentication_required'
        );

        expect(state.status).toBe('requires_action');
    });

    it('reports an asynchronous settlement as processing', async () => {
        const state = await fakePaymentProvider.confirm('fake_pi_c', 'pm_card_processing');

        expect(state.status).toBe('processing');
    });

    it('succeeds on any other method reference', async () => {
        const state = await fakePaymentProvider.confirm('fake_pi_d', FAKE_SUCCESS_METHOD);

        expect(state.status).toBe('succeeded');
    });

    it('never reports more of a card than its last four digits', async () => {
        const state = await fakePaymentProvider.confirm('fake_pi_e', 'pm_test_1881');

        expect(state.cardLast4).toBe('1881');
    });
});

describe('fakePaymentProvider.retrieve', () => {
    it('answers what a confirmed intent will settle to, not what it reported first', async () => {
        await fakePaymentProvider.confirm('fake_pi_f', 'pm_card_authentication_required');

        await expect(fakePaymentProvider.retrieve('fake_pi_f')).resolves.toMatchObject({
            status: 'succeeded'
        });
    });

    it('keeps a declined intent declined', async () => {
        await fakePaymentProvider.confirm('fake_pi_g', FAKE_DECLINE_METHOD);

        await expect(fakePaymentProvider.retrieve('fake_pi_g')).resolves.toMatchObject({
            status: 'declined'
        });
    });

    it('settles nothing for an intent it does not know', async () => {
        // `processing` is the only status that moves no money in either direction, which is what
        // an unknown reference — a restarted process, a second worker — must answer.
        await expect(fakePaymentProvider.retrieve('fake_pi_unknown')).resolves.toMatchObject({
            status: 'processing'
        });
    });
});

describe('fakePaymentProvider.refund', () => {
    it('always succeeds — there is no outside ledger to disagree', async () => {
        await expect(fakePaymentProvider.refund('fake_pi_h', charge)).resolves.toBeUndefined();
    });
});

describe('webhook signatures', () => {
    const body = Buffer.from(JSON.stringify({ id: 'evt_1' }), 'utf8');

    it('accepts a signature it produced itself', () => {
        expect(() => verifyWebhookSignature(body, signWebhookPayload(body))).not.toThrow();
    });

    it('refuses a body that changed after signing', () => {
        const signature = signWebhookPayload(body);

        expect(() =>
            verifyWebhookSignature(Buffer.from(JSON.stringify({ id: 'evt_2' })), signature)
        ).toThrow(WebhookSignatureError);
    });

    it('refuses a signature signed with another secret', () => {
        const original = process.env.NODE_PAYMENT_WEBHOOK_SECRET;
        process.env.NODE_PAYMENT_WEBHOOK_SECRET = 'someone-elses-secret';
        const forged = signWebhookPayload(body);
        process.env.NODE_PAYMENT_WEBHOOK_SECRET = original;

        expect(() => verifyWebhookSignature(body, forged)).toThrow(WebhookSignatureError);
    });

    it('refuses a replay from outside the tolerance window, signature or not', () => {
        const stale = signWebhookPayload(body, Math.floor(Date.now() / 1000) - 3600);

        expect(() => verifyWebhookSignature(body, stale)).toThrow(WebhookSignatureError);
    });

    it('refuses a malformed header', () => {
        expect(() => verifyWebhookSignature(body, 'not-a-signature')).toThrow(
            WebhookSignatureError
        );
        expect(() => verifyWebhookSignature(body, undefined)).toThrow(WebhookSignatureError);
    });

    it('refuses a signature of the wrong length without throwing something else', () => {
        expect(() => verifyWebhookSignature(body, 't=1,v1=ab')).toThrow(WebhookSignatureError);
    });
});

describe('fakePaymentProvider.parseWebhook', () => {
    it('reads a signed delivery', async () => {
        const body = Buffer.from(
            JSON.stringify({
                id: 'evt_3',
                providerRef: 'fake_pi_i',
                status: 'succeeded',
                cardLast4: '4242'
            })
        );

        await expect(
            fakePaymentProvider.parseWebhook(body, signWebhookPayload(body))
        ).resolves.toMatchObject({ id: 'evt_3', providerRef: 'fake_pi_i' });
    });

    it('refuses a delivery nobody signed', async () => {
        const body = Buffer.from(JSON.stringify({ id: 'evt_4' }));

        const now = Math.floor(Date.now() / 1000);

        await expect(
            fakePaymentProvider.parseWebhook(body, `t=${now},v1=${'0'.repeat(64)}`)
        ).rejects.toThrow(WebhookSignatureError);
    });

    it('refuses a signed body carrying no event id', async () => {
        const body = Buffer.from(JSON.stringify({ providerRef: 'fake_pi_j' }));

        await expect(
            fakePaymentProvider.parseWebhook(body, signWebhookPayload(body))
        ).rejects.toThrow(WebhookSignatureError);
    });
});

/** Re-imports the provider registry with a fresh module scope. */
const loadResolver = async () => {
    jest.resetModules();
    const module_ = await import('../../providers/index');
    return module_.resolvePaymentProvider;
};

describe('resolvePaymentProvider', () => {
    const originalProvider = process.env.NODE_PAYMENT_PROVIDER;

    afterEach(() => {
        if (originalProvider === undefined) delete process.env.NODE_PAYMENT_PROVIDER;
        else process.env.NODE_PAYMENT_PROVIDER = originalProvider;
        jest.resetModules();
    });

    it('defaults to the fake provider when unset', async () => {
        delete process.env.NODE_PAYMENT_PROVIDER;
        const resolvePaymentProvider = await loadResolver();

        expect(resolvePaymentProvider().name).toBe('fake');
    });

    it('honours an explicit known provider', async () => {
        process.env.NODE_PAYMENT_PROVIDER = 'fake';
        const resolvePaymentProvider = await loadResolver();

        expect(resolvePaymentProvider().name).toBe('fake');
    });

    it('refuses a name this build does not have, rather than falling back', async () => {
        // A typo'd variable must not quietly answer `fake`: that marks orders paid that nobody
        // was charged for.
        process.env.NODE_PAYMENT_PROVIDER = 'stripe';
        const resolvePaymentProvider = await loadResolver();

        expect(() => resolvePaymentProvider()).toThrow(/stripe/u);
    });
});
