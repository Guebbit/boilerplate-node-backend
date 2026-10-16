/**
 * @module
 * `sendOrderPlacedEmail` and `mailBuyer` (`services/notify.ts`): the confirmation is the one mail it
 * builds, and it never carries an attachment: nothing is invoiced yet at placement time, whatever the payment method
 * (see `docs/modules/invoicing.md`).
 */

import { asStub } from '@tests/stub';
import { Types } from 'mongoose';
import { logger } from '@infrastructure/adapters/logger';
import { userService } from '@modules/users';
import { mailBuyer, sendOrderPlacedEmail } from '../../services/notify';
import { ANONYMIZED_EMAIL } from '../../domain/anonymization';
import type { OrderDocument } from '../../model';

const enqueueEmailMock = jest.fn().mockResolvedValue(undefined);
jest.mock('@infrastructure/adapters/mailer', () => ({
    enqueueEmail: (...args: unknown[]) => enqueueEmailMock(...args)
}));

/** An order shaped for `sendOrderPlacedEmail` — a card order by default, the plain-confirmation path. */
const orderFixture = (overrides: Partial<OrderDocument> = {}): OrderDocument =>
    asStub<OrderDocument>({
        _id: 'order-1',
        items: [{ product: { title: 'A product', price: 10 }, quantity: 1 }],
        shippingCost: 0,
        currency: 'EUR',
        paymentMethod: 'card',
        ...overrides
    });

beforeEach(() => {
    jest.clearAllMocks();
    enqueueEmailMock.mockResolvedValue(undefined);
});

describe('sendOrderPlacedEmail — no invoice attachment', () => {
    it('sends the card confirmation with no attachment', () => {
        sendOrderPlacedEmail(orderFixture(), 'en', 'Ada', 'ada@example.com');

        const [request] = enqueueEmailMock.mock.calls[0] as [Record<string, unknown>];
        expect(request.attachments).toBeUndefined();
    });

    // The transfer's instructions are the payment's own mail; the order still gets its confirmation.
    it('sends the same confirmation, no attachment, for a bank transfer', () => {
        sendOrderPlacedEmail(
            orderFixture({
                paymentMethod: 'bank_transfer',
                payBy: new Date('2026-09-27T00:00:00.000Z')
            }),
            'en',
            'Ada',
            'ada@example.com'
        );

        const [request, templateName] = enqueueEmailMock.mock.calls[0] as [
            Record<string, unknown>,
            string
        ];
        expect(templateName).toBe('orders.order-confirm');
        expect(request.attachments).toBeUndefined();
    });
});

describe('mailBuyer — anonymised order', () => {
    it('sends nothing: never builds, never enqueues, never looks the buyer up', async () => {
        const build = jest.fn();

        await mailBuyer(orderFixture({ email: ANONYMIZED_EMAIL }), build);

        expect(build).not.toHaveBeenCalled();
        expect(enqueueEmailMock).not.toHaveBeenCalled();
    });

    it('still builds for an order with a real email', async () => {
        const build = jest.fn();

        await mailBuyer(orderFixture({ email: 'ada@example.com' }), build);

        expect(build).toHaveBeenCalledWith(expect.any(String), 'ada@example.com');
    });
});

describe('mailBuyer — buyer lookup fails', () => {
    it('builds with the order email as the name, and logs the failed lookup', async () => {
        const loggedError = jest.spyOn(logger, 'error').mockImplementation(() => logger);
        const lookupFailure = new Error('lookup unavailable');
        jest.spyOn(userService, 'getById').mockRejectedValueOnce(lookupFailure);
        const build = jest.fn();

        await mailBuyer(
            orderFixture({ email: 'ada@example.com', userId: new Types.ObjectId() }),
            build
        );

        expect(build).toHaveBeenCalledWith(expect.any(String), 'ada@example.com');
        expect(loggedError).toHaveBeenCalledWith({
            message: 'Buyer lookup failed; mailing the order with the fallback name.',
            orderId: 'order-1',
            error: lookupFailure
        });
    });
});
