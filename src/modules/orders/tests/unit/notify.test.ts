/**
 * @module
 * `sendOrderPlacedEmail` (`services/notify.ts`): which mail it builds, and its own invoice
 * attachment — rendered, spooled, and handed to `enqueueEmail` as `{ filename, key }`. A render
 * failure must never lose the mail itself; that branch is asserted here since nothing else drives
 * it. Which BUILDER fires (`orderConfirmEmail` vs. `bankTransferInstructionsEmail`) has its own
 * coverage in `emails.test.ts` — this file only asserts the attachment rides along with either.
 */

import { asStub } from '@tests/stub';
import { withEnvironmentOverrides } from '@tests/environment';
import type { OrderDocument } from '../../model';

const renderInvoicePdfMock = jest.fn();
jest.mock('../../services/invoice', () => ({
    renderInvoicePdf: (orderId: string) => renderInvoicePdfMock(orderId)
}));

const spoolAttachmentMock = jest.fn();
jest.mock('@infrastructure/adapters/mail-spool', () => ({
    spoolAttachment: (bytes: Buffer, extension: string) => spoolAttachmentMock(bytes, extension)
}));

const enqueueEmailMock = jest.fn().mockResolvedValue(undefined);
jest.mock('@infrastructure/adapters/mailer', () => ({
    enqueueEmail: (...args: unknown[]) => enqueueEmailMock(...args)
}));

const loggerMock = { error: jest.fn() };
jest.mock('@infrastructure/adapters/logger', () => ({
    __esModule: true,
    get logger() {
        return loggerMock;
    }
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

/** Flushes the microtask queue `sendOrderPlacedEmail`'s own internal `.then` chain runs on. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
    jest.clearAllMocks();
    enqueueEmailMock.mockResolvedValue(undefined);
});

describe('sendOrderPlacedEmail — attaching the invoice', () => {
    it('attaches the invoice under its own number once rendered and spooled', async () => {
        renderInvoicePdfMock.mockResolvedValue(Buffer.from('pdf-bytes'));
        spoolAttachmentMock.mockResolvedValue('a-spool-key.pdf');
        const { sendOrderPlacedEmail } = await import('../../services/notify');

        sendOrderPlacedEmail(
            orderFixture({ invoiceNumber: '2026-000041' }),
            'en',
            'Ada',
            'ada@example.com'
        );
        await flush();

        expect(spoolAttachmentMock).toHaveBeenCalledWith(Buffer.from('pdf-bytes'), 'pdf');
        const [request] = enqueueEmailMock.mock.calls[0] as [{ attachments: unknown }];
        expect(request.attachments).toEqual([
            { filename: 'invoice-2026-000041.pdf', key: 'a-spool-key.pdf' }
        ]);
    });

    it('falls back to the order id for the filename when there is no invoice number', async () => {
        renderInvoicePdfMock.mockResolvedValue(Buffer.from('pdf-bytes'));
        spoolAttachmentMock.mockResolvedValue('a-spool-key.pdf');
        const { sendOrderPlacedEmail } = await import('../../services/notify');

        sendOrderPlacedEmail(orderFixture(), 'en', 'Ada', 'ada@example.com');
        await flush();

        const [request] = enqueueEmailMock.mock.calls[0] as [{ attachments: unknown }];
        expect(request.attachments).toEqual([
            { filename: 'invoice-order-1.pdf', key: 'a-spool-key.pdf' }
        ]);
    });

    it('sends the mail with no attachment, logged, rather than losing it when the render fails', async () => {
        renderInvoicePdfMock.mockRejectedValue(new Error('puppeteer died'));
        const { sendOrderPlacedEmail } = await import('../../services/notify');

        sendOrderPlacedEmail(orderFixture(), 'en', 'Ada', 'ada@example.com');
        await flush();

        expect(spoolAttachmentMock).not.toHaveBeenCalled();
        expect(loggerMock.error).toHaveBeenCalledWith(
            expect.objectContaining({ orderId: 'order-1' })
        );
        const [request] = enqueueEmailMock.mock.calls[0] as [{ attachments: unknown }];
        expect(request.attachments).toEqual([]);
    });

    it('sends the mail with no attachment when the order has nothing left to render', async () => {
        renderInvoicePdfMock.mockResolvedValue(undefined);
        const { sendOrderPlacedEmail } = await import('../../services/notify');

        sendOrderPlacedEmail(orderFixture(), 'en', 'Ada', 'ada@example.com');
        await flush();

        expect(spoolAttachmentMock).not.toHaveBeenCalled();
        const [request] = enqueueEmailMock.mock.calls[0] as [{ attachments: unknown }];
        expect(request.attachments).toEqual([]);
    });

    it('attaches the invoice to the bank-transfer instructions mail too', async () => {
        await withEnvironmentOverrides(
            {
                NODE_BANK_TRANSFER_BENEFICIARY: 'Guebbit Shop',
                NODE_BANK_TRANSFER_IBAN: 'DE89370400440532013000'
            },
            async () => {
                renderInvoicePdfMock.mockResolvedValue(Buffer.from('pdf-bytes'));
                spoolAttachmentMock.mockResolvedValue('a-spool-key.pdf');
                const { sendOrderPlacedEmail } = await import('../../services/notify');

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
                await flush();

                const [request, templateName] = enqueueEmailMock.mock.calls[0] as [
                    { attachments: unknown },
                    string
                ];
                expect(templateName).toBe('orders.order-transfer-instructions');
                expect(request.attachments).toEqual([
                    { filename: 'invoice-order-1.pdf', key: 'a-spool-key.pdf' }
                ]);
            }
        );
    });
});
