/**
 * @module
 * The invoice render (`services/invoice.ts`): the order's own frozen locale, the not-found case,
 * a failed render, and the cache-cleanup pair (`deleteCachedInvoice`/`reapOrphanedInvoices`) kept
 * ready for the disk cache that lands next. The second describe block below covers an unrelated
 * concern that happens to share this file for historical reasons — the upload chain re-entering
 * the request locale after multer consumes the stream mid-request.
 */

import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
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
    renderHtmlToPdf: (html: string) => renderHtmlToPdfMock(html)
}));

const findByIdRawMock = jest.fn();
const existingIdsMock = jest.fn();
jest.mock('../../repository', () => ({
    orderRepository: {
        findByIdRaw: (id: string) => findByIdRawMock(id),
        existingIds: (ids: readonly string[]) => existingIdsMock(ids)
    }
}));

/** The HTML handed to the (mocked) PDF renderer. */
const renderedHtml = () => renderHtmlToPdfMock.mock.calls[0][0] as string;

/** An order the way `orderRepository.findByIdRaw` would return it — the fields the renderer reads. */
const orderFixture = (locale = 'en') => ({
    items: [{ product: { title: 'A product', price: 10 }, quantity: 2, locale }]
});

/** Whether a path names a real file — the cache tests' own way of proving a delete landed. */
const fileExists = (target: string): Promise<boolean> =>
    stat(target).then(
        () => true,
        () => false
    );

describe('renderInvoicePdf — the order renders in its OWN frozen locale', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        renderHtmlToPdfMock.mockResolvedValue(Buffer.from('pdf'));
    });

    it('renders the Italian copy for an order whose lines were frozen in Italian', async () => {
        findByIdRawMock.mockResolvedValue(orderFixture('it'));
        const { renderInvoicePdf } = await import('../../services/invoice');

        await renderInvoicePdf('order-1');

        expect(renderedHtml()).toContain(escaped(itOrders.orders.invoice.title));
        expect(renderedHtml()).toContain('<html lang="it"');
    });

    it('renders English copy as English', async () => {
        findByIdRawMock.mockResolvedValue(orderFixture('en'));
        const { renderInvoicePdf } = await import('../../services/invoice');

        await renderInvoicePdf('order-1');

        expect(renderedHtml()).toContain(escaped(enOrders.orders.invoice.title));
    });

    it("ignores the ambient locale — the order's own frozen locale wins", async () => {
        findByIdRawMock.mockResolvedValue(orderFixture('it'));
        const { renderInvoicePdf } = await import('../../services/invoice');

        await runWithLocale('en', () => renderInvoicePdf('order-1'));

        expect(renderedHtml()).toContain(escaped(itOrders.orders.invoice.title));
    });

    it('falls back to the default locale when the order carries no items', async () => {
        findByIdRawMock.mockResolvedValue({ items: [] });
        const { renderInvoicePdf } = await import('../../services/invoice');

        await renderInvoicePdf('order-1');

        expect(renderedHtml()).toContain(`<html lang="${getDefaultLocale()}"`);
    });

    it('names the order in the title, not `undefined`', async () => {
        findByIdRawMock.mockResolvedValue(orderFixture('en'));
        const { renderInvoicePdf } = await import('../../services/invoice');

        await renderInvoicePdf('order-1');

        expect(renderedHtml()).toContain(
            escaped(enOrders.orders.invoice['meta-title'].replace('{{order}}', 'order-1'))
        );
        expect(renderedHtml()).not.toContain('undefined');
    });

    it('answers undefined for an order that no longer exists, and renders nothing', async () => {
        findByIdRawMock.mockResolvedValue(null);
        const { renderInvoicePdf } = await import('../../services/invoice');

        await expect(renderInvoicePdf('gone')).resolves.toBeUndefined();

        expect(renderHtmlToPdfMock).not.toHaveBeenCalled();
    });

    it('lets a failed render reject, rather than answering a broken PDF', async () => {
        findByIdRawMock.mockResolvedValue(orderFixture('en'));
        renderHtmlToPdfMock.mockRejectedValueOnce(new Error('puppeteer died'));
        const { renderInvoicePdf } = await import('../../services/invoice');

        await expect(renderInvoicePdf('order-1')).rejects.toThrow('puppeteer died');
    });
});

describe('deleteCachedInvoice', () => {
    let storageRoot: string;
    const originalStoragePath = process.env.NODE_INVOICE_STORAGE_PATH;

    beforeEach(async () => {
        jest.clearAllMocks();
        storageRoot = await mkdtemp(path.join(tmpdir(), 'invoice-test-'));
        process.env.NODE_INVOICE_STORAGE_PATH = storageRoot;
    });

    afterEach(async () => {
        await rm(storageRoot, { recursive: true, force: true });
        if (originalStoragePath === undefined) delete process.env.NODE_INVOICE_STORAGE_PATH;
        else process.env.NODE_INVOICE_STORAGE_PATH = originalStoragePath;
    });

    it('deletes the cached file and reports it deleted', async () => {
        const target = path.join(storageRoot, 'order-1.pdf');
        await writeFile(target, Buffer.from('bytes'));
        const { deleteCachedInvoice } = await import('../../services/invoice');

        await expect(deleteCachedInvoice('order-1')).resolves.toBe(true);
        await expect(fileExists(target)).resolves.toBe(false);
    });

    // `remove()`'s hard-delete calls this unconditionally, and nothing has ever rendered this
    // order's invoice yet — there is no cache to have anything in it.
    it('answers false, without throwing, when nothing was cached', async () => {
        const { deleteCachedInvoice } = await import('../../services/invoice');

        await expect(deleteCachedInvoice('never-generated')).resolves.toBe(false);
    });
});

describe('reapOrphanedInvoices', () => {
    let storageRoot: string;
    const originalStoragePath = process.env.NODE_INVOICE_STORAGE_PATH;

    /** 24-hex ids shaped like real `_id`s — the only filename shape this reaper ever risks against the database. */
    const ORDER_A = '507f1f77bcf86cd799439011';
    const ORDER_B = '507f1f77bcf86cd799439012';

    beforeEach(async () => {
        jest.clearAllMocks();
        storageRoot = await mkdtemp(path.join(tmpdir(), 'invoice-test-'));
        process.env.NODE_INVOICE_STORAGE_PATH = storageRoot;
    });

    afterEach(async () => {
        await rm(storageRoot, { recursive: true, force: true });
        if (originalStoragePath === undefined) delete process.env.NODE_INVOICE_STORAGE_PATH;
        else process.env.NODE_INVOICE_STORAGE_PATH = originalStoragePath;
    });

    it('deletes a file whose order no longer exists, and leaves one whose order does', async () => {
        const pathA = path.join(storageRoot, `${ORDER_A}.pdf`);
        const pathB = path.join(storageRoot, `${ORDER_B}.pdf`);
        await writeFile(pathA, Buffer.from('bytes'));
        await writeFile(pathB, Buffer.from('bytes'));
        existingIdsMock.mockResolvedValue(new Set([ORDER_B]));
        const { reapOrphanedInvoices } = await import('../../services/invoice');

        await expect(reapOrphanedInvoices()).resolves.toBe(1);

        expect(existingIdsMock).toHaveBeenCalledWith(expect.arrayContaining([ORDER_A, ORDER_B]));
        await expect(fileExists(pathA)).resolves.toBe(false);
        await expect(fileExists(pathB)).resolves.toBe(true);
    });

    it('leaves a filename that is not a bare 24-hex id alone, and never risks it against the database', async () => {
        const strayPath = path.join(storageRoot, 'not-an-order-id.pdf');
        await writeFile(strayPath, Buffer.from('bytes'));
        const { reapOrphanedInvoices } = await import('../../services/invoice');

        await expect(reapOrphanedInvoices()).resolves.toBe(0);

        expect(existingIdsMock).not.toHaveBeenCalled();
        await expect(fileExists(strayPath)).resolves.toBe(true);
    });

    it('answers 0 without touching the database when the storage directory does not exist yet', async () => {
        await rm(storageRoot, { recursive: true, force: true });
        const { reapOrphanedInvoices } = await import('../../services/invoice');

        await expect(reapOrphanedInvoices()).resolves.toBe(0);

        expect(existingIdsMock).not.toHaveBeenCalled();
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
