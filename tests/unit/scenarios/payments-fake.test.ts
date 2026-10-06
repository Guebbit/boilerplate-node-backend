/**
 * @module
 * The fake PSP's outcome logic — `scenarios/support/doubles/payments/fake.ts`, a test double that
 * never ships. No mocks, no database. The port and the signature discipline every real provider
 * shares are tested with the payments module, in `providers.test.ts`.
 */

import {
    FAKE_DECLINE_METHOD,
    FAKE_SUCCESS_METHOD,
    fakePaymentProvider,
    setFakeOutcome
} from '@scenarios/support/doubles/payments/fake';
import {
    PaymentInFlightError,
    signWebhookPayload,
    WebhookRejected
} from '@modules/payments/providers';

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

    it('answers a lever-set outcome nobody confirmed, which is how a webhook finds one', async () => {
        setFakeOutcome('fake_pi_lever', { status: 'succeeded', cardLast4: '4242' });

        await expect(fakePaymentProvider.retrieve('fake_pi_lever')).resolves.toEqual({
            status: 'succeeded',
            cardLast4: '4242'
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
        await expect(
            fakePaymentProvider.refund('fake_pi_h', charge, { idempotencyKey: 'refund:payment-1' })
        ).resolves.toEqual({ refundRef: 're_fake_refund:payment-1' });
    });

    it('answers the same refund id for the same idempotency key', async () => {
        const first = await fakePaymentProvider.refund('fake_pi_h', charge, {
            idempotencyKey: 'k'
        });
        const second = await fakePaymentProvider.refund('fake_pi_h', charge, {
            idempotencyKey: 'k'
        });

        expect(second).toEqual(first);
    });
});

describe('fakePaymentProvider.cancel', () => {
    it('closes an intent nobody ever confirmed', async () => {
        await expect(
            fakePaymentProvider.cancel('fake_pi_never_confirmed', { reason: 'abandoned' })
        ).resolves.toBeUndefined();
    });

    it('answers a second cancel of the same intent as success, not a repeat refusal', async () => {
        await fakePaymentProvider.cancel('fake_pi_twice', { reason: 'abandoned' });

        await expect(
            fakePaymentProvider.cancel('fake_pi_twice', { reason: 'abandoned again' })
        ).resolves.toBeUndefined();
    });

    it('lets a declined attempt be cancelled — nothing at the provider is still moving', async () => {
        await fakePaymentProvider.confirm('fake_pi_declined_cancel', FAKE_DECLINE_METHOD);

        await expect(
            fakePaymentProvider.cancel('fake_pi_declined_cancel', { reason: 'recorded by hand' })
        ).resolves.toBeUndefined();
    });

    it('refuses to cancel a payment that already succeeded at the provider', async () => {
        await fakePaymentProvider.confirm('fake_pi_succeeded_cancel', FAKE_SUCCESS_METHOD);

        await expect(
            fakePaymentProvider.cancel('fake_pi_succeeded_cancel', { reason: 'recorded by hand' })
        ).rejects.toThrow(PaymentInFlightError);
    });
});

describe('fakePaymentProvider.parseWebhook', () => {
    it('reads a signed delivery', async () => {
        const body = Buffer.from(
            JSON.stringify({
                id: 'evt_3',
                providerRef: 'fake_pi_i'
            })
        );

        // Thin: which event and which intent, and no state. That is `retrieve`'s answer.
        await expect(
            fakePaymentProvider.parseWebhook(body, signWebhookPayload(body))
        ).resolves.toEqual({ id: 'evt_3', providerRef: 'fake_pi_i' });
    });

    it('refuses a delivery nobody signed', async () => {
        const body = Buffer.from(JSON.stringify({ id: 'evt_4' }));

        const now = Math.floor(Date.now() / 1000);

        await expect(
            fakePaymentProvider.parseWebhook(body, `t=${now},v1=${'0'.repeat(64)}`)
        ).rejects.toThrow(WebhookRejected);
    });

    it.each([
        ['an operator object where the providerRef string belongs', { providerRef: { $ne: null } }],
        ['an operator object as the id', { id: { $gt: '' } }],
        ['a field the contract does not name', { providerRef: 'fake_pi_k', status: 'succeeded' }],
        ['an oversize id', { id: 'x'.repeat(201) }],
        ['an oversize providerRef', { providerRef: 'p'.repeat(201) }],
        ['a number as the providerRef', { providerRef: 7 }]
    ])(
        'refuses a SIGNED body carrying %s, before any lookup could see it',
        async (_label, extra) => {
            const body = Buffer.from(JSON.stringify({ id: 'evt_5', ...extra }));

            await expect(
                fakePaymentProvider.parseWebhook(body, signWebhookPayload(body))
            ).rejects.toThrow(WebhookRejected);
        }
    );

    it('accepts an event with no providerRef, which the service acknowledges and ignores', async () => {
        const body = Buffer.from(JSON.stringify({ id: 'evt_6' }));

        await expect(
            fakePaymentProvider.parseWebhook(body, signWebhookPayload(body))
        ).resolves.toEqual({ id: 'evt_6', providerRef: undefined });
    });

    it('refuses a signed body that is not JSON', async () => {
        const body = Buffer.from('not json at all');

        await expect(
            fakePaymentProvider.parseWebhook(body, signWebhookPayload(body))
        ).rejects.toThrow('Body is not valid JSON');
    });

    it('refuses a signed JSON body that is not an object', async () => {
        const body = Buffer.from('[1,2,3]');

        await expect(
            fakePaymentProvider.parseWebhook(body, signWebhookPayload(body))
        ).rejects.toThrow(WebhookRejected);
    });

    it('refuses a signed body carrying no event id', async () => {
        const body = Buffer.from(JSON.stringify({ providerRef: 'fake_pi_j' }));

        await expect(
            fakePaymentProvider.parseWebhook(body, signWebhookPayload(body))
        ).rejects.toThrow(WebhookRejected);
    });
});
