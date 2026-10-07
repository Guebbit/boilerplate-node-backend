/**
 * @module
 * `sendOrderPlacedEmail` and `mailBuyer` (`services/notify.ts`): which mail it builds — `orderConfirmEmail` vs.
 * `bankTransferInstructionsEmail` has its own coverage in `emails.test.ts` — and that NEITHER ever
 * carries an attachment: nothing is invoiced yet at placement time, whatever the payment method
 * (see `docs/modules/invoicing.md`).
 */

import { asStub } from '@tests/stub';
import { withEnvironmentOverrides } from '@tests/environment';
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

    it('sends the bank-transfer instructions with no attachment either', async () => {
        await withEnvironmentOverrides(
            {
                NODE_BANK_TRANSFER_BENEFICIARY: 'Guebbit Shop',
                NODE_BANK_TRANSFER_IBAN: 'DE89370400440532013000'
            },
            () => {
                sendOrderPlacedEmail(
                    orderFixture({
                        paymentMethod: 'bank_transfer',
                        payBy: new Date('2026-09-27T00:00:00.000Z'),
                        transferReference: 'RF18539007547034'
                    }),
                    'en',
                    'Ada',
                    'ada@example.com'
                );

                const [request, templateName] = enqueueEmailMock.mock.calls[0] as [
                    Record<string, unknown>,
                    string
                ];
                expect(templateName).toBe('orders.order-transfer-instructions');
                expect(request.attachments).toBeUndefined();
                return Promise.resolve();
            }
        );
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
