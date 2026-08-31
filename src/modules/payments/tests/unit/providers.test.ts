/**
 * @module
 * The payment provider port and its `fake` implementation — `src/modules/payments/providers/`.
 * No mocks, no database: `service.test.ts` moved to `tests/integration/` because it persists a
 * payment document, while the provider selection and the fake PSP's outcome logic don't touch
 * Mongo and belong here.
 */

import { cardLastFour } from '../../providers/card';
import { FAKE_DECLINE_CARD, fakePaymentProvider } from '../../providers/fake';

describe('cardLastFour', () => {
    it('keeps only the last four digits', () => {
        expect(cardLastFour('4242424242424242')).toBe('4242');
    });

    it('strips spaces before slicing', () => {
        expect(cardLastFour('4242 4242 4242 4242')).toBe('4242');
    });
});

describe('fakePaymentProvider.charge', () => {
    it('declines the documented magic number', async () => {
        const outcome = await fakePaymentProvider.charge(
            { amount: 1000, currency: 'eur' },
            { cardNumber: FAKE_DECLINE_CARD }
        );

        expect(outcome).toBe('declined');
    });

    it('declines the decline card even with spaces, matching how a form would send it', async () => {
        const outcome = await fakePaymentProvider.charge(
            { amount: 1000, currency: 'eur' },
            { cardNumber: '4000 0000 0000 0002' }
        );

        expect(outcome).toBe('declined');
    });

    it('succeeds on any other card number', async () => {
        const outcome = await fakePaymentProvider.charge(
            { amount: 1000, currency: 'eur' },
            { cardNumber: '4242424242424242' }
        );

        expect(outcome).toBe('succeeded');
    });
});

describe('fakePaymentProvider.refund', () => {
    it('always succeeds — there is no outside ledger to disagree', async () => {
        await expect(
            fakePaymentProvider.refund({ amount: 1000, currency: 'eur' })
        ).resolves.toBeUndefined();
    });
});

/** Re-imports the provider registry with a fresh module scope, so its memoisation resets. */
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
});
