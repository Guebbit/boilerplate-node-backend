/**
 * @module
 * The async invoice PDF pipeline (`transport/invoice-pdf.ts`): locale resolution, the
 * enqueue-or-inline fallback, the queue handler's three-outcome contract, and stored-file
 * round-tripping. The second describe block below covers an unrelated concern that happens to
 * share this file for historical reasons — the upload chain re-entering the request locale after
 * multer consumes the stream mid-request.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { asStub } from '@tests/stub';
import { runWithLocale, getLocaleContext, getDefaultLocale } from '@infrastructure/i18n';
import enOrders from '../../locales/en.json';
import itOrders from '../../locales/it.json';

/**
 * EJS `<%= %>` escapes its output — deliberately, since these templates interpolate
 * user-supplied product titles — so `L'ordine` reaches the page as `L&#39;ordine`. Expectations
 * are escaped the same way rather than the templates being loosened to `<%- %>`.
 */
const escaped = (value: string) =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&#34;')
        .replaceAll("'", '&#39;');

const renderHtmlToPdfMock = jest.fn().mockResolvedValue(Buffer.from('pdf'));
jest.mock('@infrastructure/adapters/pdf', () => ({
    renderHtmlToPdf: (html: string, options?: unknown) => renderHtmlToPdfMock(html, options)
}));

const findByIdRawMock = jest.fn();
const markInvoicePdfReadyMock = jest.fn();
const markInvoicePdfPendingMock = jest.fn();
jest.mock('../../repository', () => ({
    orderRepository: {
        findByIdRaw: (id: string) => findByIdRawMock(id),
        markInvoicePdfReady: (id: string) => markInvoicePdfReadyMock(id),
        markInvoicePdfPending: (id: string) => markInvoicePdfPendingMock(id)
    }
}));

const isQueueEnabledMock = jest.fn();
const publishToQueueMock = jest.fn();
jest.mock('@infrastructure/adapters/queue', () => ({
    isQueueEnabled: () => isQueueEnabledMock(),
    publishToQueue: (options: unknown) => publishToQueueMock(options)
}));

/** The HTML handed to the (mocked) PDF renderer. */
const renderedHtml = () => renderHtmlToPdfMock.mock.calls[0][0] as string;

/** An order the way `orderRepository.findByIdRaw` would return it — the fields the worker reads. */
const orderFixture = (locale = 'en') => ({
    items: [{ product: { title: 'A product', price: 10 }, quantity: 2, locale }]
});

describe('the invoice worker renders the order in its OWN frozen locale', () => {
    let storageRoot: string;
    const originalStoragePath = process.env.NODE_INVOICE_STORAGE_PATH;

    beforeEach(async () => {
        jest.clearAllMocks();
        renderHtmlToPdfMock.mockResolvedValue(Buffer.from('pdf'));
        markInvoicePdfReadyMock.mockResolvedValue(true);
        storageRoot = await mkdtemp(path.join(tmpdir(), 'invoice-pdf-test-'));
        process.env.NODE_INVOICE_STORAGE_PATH = storageRoot;
    });

    afterEach(async () => {
        await rm(storageRoot, { recursive: true, force: true });
        if (originalStoragePath === undefined) delete process.env.NODE_INVOICE_STORAGE_PATH;
        else process.env.NODE_INVOICE_STORAGE_PATH = originalStoragePath;
    });

    afterAll(() => jest.restoreAllMocks());

    it('renders the Italian copy for an order whose lines were frozen in Italian', async () => {
        findByIdRawMock.mockResolvedValue(orderFixture('it'));
        const { handleInvoicePdfJob } = await import('../../transport/invoice-pdf');

        await expect(handleInvoicePdfJob({ orderId: 'order-1' })).resolves.toBe(true);

        expect(renderedHtml()).toContain(escaped(itOrders.orders.invoice.title));
        expect(renderedHtml()).toContain('<html lang="it"');
    });

    it('renders English copy as English', async () => {
        findByIdRawMock.mockResolvedValue(orderFixture('en'));
        const { handleInvoicePdfJob } = await import('../../transport/invoice-pdf');

        await expect(handleInvoicePdfJob({ orderId: 'order-1' })).resolves.toBe(true);

        expect(renderedHtml()).toContain(escaped(enOrders.orders.invoice.title));
    });

    /**
     * The point of the design, updated for where the worker lives now: draining a queue from
     * inside an unrelated ambient locale cannot colour the output, because the render locale comes
     * from the ORDER's own frozen `items[0].locale`, never from anything ambient.
     */
    it("ignores the ambient locale — the order's own frozen locale wins", async () => {
        findByIdRawMock.mockResolvedValue(orderFixture('it'));
        const { handleInvoicePdfJob } = await import('../../transport/invoice-pdf');

        await runWithLocale('en', () => handleInvoicePdfJob({ orderId: 'order-1' }));

        expect(renderedHtml()).toContain(escaped(itOrders.orders.invoice.title));
    });

    it('falls back to the default locale when the order carries no items', async () => {
        findByIdRawMock.mockResolvedValue({ items: [] });
        const { handleInvoicePdfJob } = await import('../../transport/invoice-pdf');

        await handleInvoicePdfJob({ orderId: 'order-1' });

        expect(renderedHtml()).toContain(`<html lang="${getDefaultLocale()}"`);
    });

    it('names the order in the title, not `undefined`', async () => {
        findByIdRawMock.mockResolvedValue(orderFixture('en'));
        const { handleInvoicePdfJob } = await import('../../transport/invoice-pdf');

        await handleInvoicePdfJob({ orderId: 'order-1' });

        expect(renderedHtml()).toContain(
            escaped(enOrders.orders.invoice['meta-title'].replace('{{order}}', 'order-1'))
        );
        expect(renderedHtml()).not.toContain('undefined');
    });

    it('marks the order ready once the PDF is durably written', async () => {
        findByIdRawMock.mockResolvedValue(orderFixture('en'));
        const { handleInvoicePdfJob } = await import('../../transport/invoice-pdf');

        await handleInvoicePdfJob({ orderId: 'order-1' });

        expect(markInvoicePdfReadyMock).toHaveBeenCalledWith('order-1');
    });

    it('discards a malformed job rather than looking anything up', async () => {
        const { handleInvoicePdfJob } = await import('../../transport/invoice-pdf');

        await expect(handleInvoicePdfJob({})).resolves.toBe(false);

        expect(findByIdRawMock).not.toHaveBeenCalled();
        expect(renderHtmlToPdfMock).not.toHaveBeenCalled();
    });

    it('acks rather than retries when the order no longer exists', async () => {
        // Hard-deleted between enqueue and drain — nothing to render, and nothing worth a
        // redelivery either.
        findByIdRawMock.mockResolvedValue(null);
        const { handleInvoicePdfJob } = await import('../../transport/invoice-pdf');

        await expect(handleInvoicePdfJob({ orderId: 'gone' })).resolves.toBe(true);

        expect(renderHtmlToPdfMock).not.toHaveBeenCalled();
        expect(markInvoicePdfReadyMock).not.toHaveBeenCalled();
    });

    it('lets a failed render reject, so the broker redelivers it', async () => {
        findByIdRawMock.mockResolvedValue(orderFixture('en'));
        renderHtmlToPdfMock.mockRejectedValueOnce(new Error('puppeteer died'));
        const { handleInvoicePdfJob } = await import('../../transport/invoice-pdf');

        await expect(handleInvoicePdfJob({ orderId: 'order-1' })).rejects.toThrow('puppeteer died');
        expect(markInvoicePdfReadyMock).not.toHaveBeenCalled();
    });
});

describe('enqueueInvoicePdfJob', () => {
    let storageRoot: string;
    const originalStoragePath = process.env.NODE_INVOICE_STORAGE_PATH;

    beforeEach(async () => {
        jest.clearAllMocks();
        renderHtmlToPdfMock.mockResolvedValue(Buffer.from('pdf'));
        markInvoicePdfReadyMock.mockResolvedValue(true);
        findByIdRawMock.mockResolvedValue(orderFixture('en'));
        storageRoot = await mkdtemp(path.join(tmpdir(), 'invoice-pdf-test-'));
        process.env.NODE_INVOICE_STORAGE_PATH = storageRoot;
    });

    afterEach(async () => {
        await rm(storageRoot, { recursive: true, force: true });
        if (originalStoragePath === undefined) delete process.env.NODE_INVOICE_STORAGE_PATH;
        else process.env.NODE_INVOICE_STORAGE_PATH = originalStoragePath;
    });

    it('publishes to the queue, and renders nothing itself, when a broker is configured', async () => {
        isQueueEnabledMock.mockReturnValue(true);
        publishToQueueMock.mockResolvedValue(true);
        const { enqueueInvoicePdfJob } = await import('../../transport/invoice-pdf');

        await enqueueInvoicePdfJob('order-1');

        expect(publishToQueueMock).toHaveBeenCalledWith(
            expect.objectContaining({ payload: { orderId: 'order-1' } })
        );
        expect(renderHtmlToPdfMock).not.toHaveBeenCalled();
    });

    /*
     * Same fallback shape as `enqueueEmail`: without it, every order created in a dev/demo
     * deployment with no RabbitMQ configured would stay `pending` forever, with nothing ever able
     * to flip it.
     */
    it('renders inline when no broker is configured', async () => {
        isQueueEnabledMock.mockReturnValue(false);
        const { enqueueInvoicePdfJob } = await import('../../transport/invoice-pdf');

        await enqueueInvoicePdfJob('order-1');

        expect(publishToQueueMock).not.toHaveBeenCalled();
        expect(renderHtmlToPdfMock).toHaveBeenCalled();
        expect(markInvoicePdfReadyMock).toHaveBeenCalledWith('order-1');
    });

    it('renders inline when the broker is configured but the publish itself fails', async () => {
        isQueueEnabledMock.mockReturnValue(true);
        publishToQueueMock.mockResolvedValue(false);
        const { enqueueInvoicePdfJob } = await import('../../transport/invoice-pdf');

        await enqueueInvoicePdfJob('order-1');

        expect(renderHtmlToPdfMock).toHaveBeenCalled();
        expect(markInvoicePdfReadyMock).toHaveBeenCalledWith('order-1');
    });
});

describe('enqueueInvoicePdfRetry', () => {
    let storageRoot: string;
    const originalStoragePath = process.env.NODE_INVOICE_STORAGE_PATH;

    beforeEach(async () => {
        jest.clearAllMocks();
        renderHtmlToPdfMock.mockResolvedValue(Buffer.from('pdf'));
        markInvoicePdfReadyMock.mockResolvedValue(true);
        findByIdRawMock.mockResolvedValue(orderFixture('en'));
        storageRoot = await mkdtemp(path.join(tmpdir(), 'invoice-pdf-test-'));
        process.env.NODE_INVOICE_STORAGE_PATH = storageRoot;
    });

    afterEach(async () => {
        await rm(storageRoot, { recursive: true, force: true });
        if (originalStoragePath === undefined) delete process.env.NODE_INVOICE_STORAGE_PATH;
        else process.env.NODE_INVOICE_STORAGE_PATH = originalStoragePath;
    });

    it('flips to pending and enqueues — the self-heal path for an absent status or a missing file', async () => {
        isQueueEnabledMock.mockReturnValue(false);
        markInvoicePdfPendingMock.mockResolvedValue(true);
        const { enqueueInvoicePdfRetry } = await import('../../transport/invoice-pdf');

        await enqueueInvoicePdfRetry('order-1');

        expect(markInvoicePdfPendingMock).toHaveBeenCalledWith('order-1');
        expect(renderHtmlToPdfMock).toHaveBeenCalled();
        expect(markInvoicePdfReadyMock).toHaveBeenCalledWith('order-1');
    });

    it('enqueues nothing when a render is already in flight — markInvoicePdfPending found it already pending', async () => {
        markInvoicePdfPendingMock.mockResolvedValue(false);
        const { enqueueInvoicePdfRetry } = await import('../../transport/invoice-pdf');

        await enqueueInvoicePdfRetry('order-1');

        expect(isQueueEnabledMock).not.toHaveBeenCalled();
        expect(renderHtmlToPdfMock).not.toHaveBeenCalled();
    });
});

describe('readStoredInvoicePdf', () => {
    let storageRoot: string;
    const originalStoragePath = process.env.NODE_INVOICE_STORAGE_PATH;

    beforeEach(async () => {
        jest.clearAllMocks();
        renderHtmlToPdfMock.mockImplementation((_html: string, options?: { path?: string }) =>
            // The real renderer writes to `options.path` via Puppeteer's own `page.pdf({path})`
            // — reproduced here with a plain write so the round trip through
            // `readStoredInvoicePdf` has a real file to read back.
            import('node:fs/promises').then(({ writeFile }) =>
                writeFile(options?.path ?? '', Buffer.from('stored-pdf-bytes')).then(() =>
                    Buffer.from('stored-pdf-bytes')
                )
            )
        );
        markInvoicePdfReadyMock.mockResolvedValue(true);
        findByIdRawMock.mockResolvedValue(orderFixture('en'));
        storageRoot = await mkdtemp(path.join(tmpdir(), 'invoice-pdf-test-'));
        process.env.NODE_INVOICE_STORAGE_PATH = storageRoot;
    });

    afterEach(async () => {
        await rm(storageRoot, { recursive: true, force: true });
        if (originalStoragePath === undefined) delete process.env.NODE_INVOICE_STORAGE_PATH;
        else process.env.NODE_INVOICE_STORAGE_PATH = originalStoragePath;
    });

    it('reads back what the worker wrote', async () => {
        const { handleInvoicePdfJob, readStoredInvoicePdf } =
            await import('../../transport/invoice-pdf');

        await handleInvoicePdfJob({ orderId: 'order-1' });

        await expect(readStoredInvoicePdf('order-1')).resolves.toEqual(
            Buffer.from('stored-pdf-bytes')
        );
    });

    it('answers undefined when nothing is stored for that order', async () => {
        const { readStoredInvoicePdf } = await import('../../transport/invoice-pdf');

        await expect(readStoredInvoicePdf('never-generated')).resolves.toBeUndefined();
    });
});

/**
 * Drives a middleware the way express does, from OUTSIDE any locale scope — which is the
 * situation multer leaves the chain in.
 */
const runMiddleware = async (middleware: unknown, request: Request) =>
    new Promise<string | undefined>((resolve) => {
        (middleware as (r: Request, s: Response, n: NextFunction) => void)(
            request,
            {} as Response,
            (() => resolve(getLocaleContext()?.locale)) as NextFunction
        );
    });

/**
 * `upload.single` wraps multer so the request's locale survives the stream being consumed (see
 * `infrastructure/http/middlewares/upload.ts`). Asserted at the unit level too, distinct from the
 * integration suite's coverage of the mounted route.
 */
describe('upload.single restores the locale', () => {
    /**
     * Returns the whole pipeline — locale-restoring wrapper, content check, then image-store
     * commit. Asserted rather than assumed: mounting only the first would accept non-image bytes,
     * and mounting only the first two would leave uploads staged with nothing pointing at them.
     */
    it('returns the full guard chain', async () => {
        const { upload } = await import('@infrastructure/http/middlewares/upload');
        const handlers = upload.single('imageUpload');

        expect(handlers).toHaveLength(3);
    });

    it('re-enters the request locale', async () => {
        const { upload } = await import('@infrastructure/http/middlewares/upload');
        const [localeAware] = upload.single('imageUpload');

        const observed = await runMiddleware(
            localeAware,
            asStub<Request>({
                locale: 'it',
                headers: {}
            })
        );

        expect(observed).toBe('it');
    });

    it('leaves the chain alone when no locale was negotiated', async () => {
        const { upload } = await import('@infrastructure/http/middlewares/upload');
        const [localeAware] = upload.single('imageUpload');

        const observed = await runMiddleware(localeAware, asStub<Request>({ headers: {} }));

        expect(observed).toBeUndefined();
    });
});
