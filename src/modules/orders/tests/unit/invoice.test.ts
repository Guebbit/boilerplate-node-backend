/**
 * @module
 * The invoice render (`services/invoice.ts`): the order's own frozen locale, the not-found case, a
 * failed render, the TTL cache in front of the render, and the two reap sweeps
 * (`reapOrphanedInvoices`/`reapExpiredInvoices`). `invoiceCacheTtlMinutes()` itself — the `0` under
 * demo/test rule — is asserted in `config.test.ts`; this file mocks it to exercise the cache logic
 * a real test run's forced-`0` TTL would otherwise never reach. The last describe block below
 * covers an unrelated concern that happens to share this file for historical reasons — the upload
 * chain re-entering the request locale after multer consumes the stream mid-request.
 */

import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { asStub } from '@tests/stub';
import { fileExists } from '@tests/file-sandbox';
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

/**
 * `invoiceCacheTtlMinutes()` forces `0` under `NODE_ENV=test` — real, on purpose, and asserted in
 * `config.test.ts`. This mock is what lets the cache-specific describe block below reach the
 * non-zero branch; every other block defaults it back to `0`, matching what a real test run
 * already gets for free. `invoiceCachePath()` is left real: `NODE_INVOICE_CACHE_PATH` alone
 * controls where each block's cache directory is.
 */
const ttlMinutesMock = jest.fn(() => 0);
jest.mock('../../config', () => ({
    ...jest.requireActual('../../config'),
    invoiceCacheTtlMinutes: () => ttlMinutesMock()
}));

/** The HTML handed to the (mocked) PDF renderer. */
const renderedHtml = () => renderHtmlToPdfMock.mock.calls[0][0] as string;

/** An order the way `orderRepository.findByIdRaw` would return it — the fields the renderer reads. */
const orderFixture = (locale = 'en') => ({
    items: [{ product: { title: 'A product', price: 10 }, quantity: 2, locale }]
});

/** A cache directory scoped to one test file, torn down after. */
const withCacheRoot = () => {
    let root: string;
    const original = process.env.NODE_INVOICE_CACHE_PATH;

    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'invoice-test-'));
        process.env.NODE_INVOICE_CACHE_PATH = root;
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
        if (original === undefined) delete process.env.NODE_INVOICE_CACHE_PATH;
        else process.env.NODE_INVOICE_CACHE_PATH = original;
    });

    return {
        root: () => root,
        pathFor: (orderId: string) => path.join(root, `${orderId}.pdf`)
    };
};

describe('renderInvoicePdf — the order renders in its OWN frozen locale', () => {
    const cache = withCacheRoot();

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

    it('never touches disk when the TTL is 0 — streamed straight from the buffer', async () => {
        findByIdRawMock.mockResolvedValue(orderFixture('en'));
        const { renderInvoicePdf } = await import('../../services/invoice');

        await renderInvoicePdf('order-1');

        await expect(fileExists(cache.pathFor('order-1'))).resolves.toBe(false);
    });
});

/*
 * 1.3: N concurrent misses for the SAME order must launch Chromium once, not once per caller.
 * Run at TTL 0 rather than through the cache-miss branch below: `renderInvoicePdf` reaches
 * `renderFreshOnce` SYNCHRONOUSLY on that path, with no `readCached` gap in between, which is
 * what makes two back-to-back calls in one test deterministic rather than racing two real `stat`
 * calls against each other.
 */
describe('renderInvoicePdf — single-flight', () => {
    withCacheRoot();

    beforeEach(() => {
        jest.clearAllMocks();
        findByIdRawMock.mockResolvedValue(orderFixture('en'));
    });

    it('collapses concurrent misses for the same order into a single render', async () => {
        let resolveRender!: (bytes: Buffer) => void;
        renderHtmlToPdfMock.mockReturnValueOnce(
            new Promise((resolve) => {
                resolveRender = resolve;
            })
        );
        const { renderInvoicePdf } = await import('../../services/invoice');

        const first = renderInvoicePdf('order-1');
        const second = renderInvoicePdf('order-1');
        resolveRender(Buffer.from('fresh-bytes'));

        await expect(first).resolves.toEqual(Buffer.from('fresh-bytes'));
        await expect(second).resolves.toEqual(Buffer.from('fresh-bytes'));
        expect(findByIdRawMock).toHaveBeenCalledTimes(1);
        expect(renderHtmlToPdfMock).toHaveBeenCalledTimes(1);
    });

    it('renders separately for two different orders in the same burst', async () => {
        renderHtmlToPdfMock.mockResolvedValue(Buffer.from('pdf'));
        const { renderInvoicePdf } = await import('../../services/invoice');

        await Promise.all([renderInvoicePdf('order-1'), renderInvoicePdf('order-2')]);

        expect(findByIdRawMock).toHaveBeenCalledTimes(2);
        expect(renderHtmlToPdfMock).toHaveBeenCalledTimes(2);
    });

    it('starts a fresh render for the same order once the first one has settled', async () => {
        renderHtmlToPdfMock.mockResolvedValue(Buffer.from('pdf'));
        const { renderInvoicePdf } = await import('../../services/invoice');

        await renderInvoicePdf('order-1');
        await renderInvoicePdf('order-1');

        expect(findByIdRawMock).toHaveBeenCalledTimes(2);
        expect(renderHtmlToPdfMock).toHaveBeenCalledTimes(2);
    });
});

describe('renderInvoicePdf — the TTL cache', () => {
    const cache = withCacheRoot();

    beforeEach(() => {
        jest.clearAllMocks();
        renderHtmlToPdfMock.mockResolvedValue(Buffer.from('fresh-bytes'));
        findByIdRawMock.mockResolvedValue(orderFixture('en'));
        ttlMinutesMock.mockReturnValue(5);
    });

    afterEach(() => ttlMinutesMock.mockReturnValue(0));

    it('serves a fresh cache hit without touching the database or Chromium', async () => {
        await writeFile(cache.pathFor('order-1'), Buffer.from('cached-bytes'));
        const { renderInvoicePdf } = await import('../../services/invoice');

        await expect(renderInvoicePdf('order-1')).resolves.toEqual(Buffer.from('cached-bytes'));

        expect(findByIdRawMock).not.toHaveBeenCalled();
        expect(renderHtmlToPdfMock).not.toHaveBeenCalled();
    });

    it('renders fresh and writes the cache when nothing is cached yet', async () => {
        const { renderInvoicePdf } = await import('../../services/invoice');

        await expect(renderInvoicePdf('order-1')).resolves.toEqual(Buffer.from('fresh-bytes'));

        expect(renderHtmlToPdfMock).toHaveBeenCalled();
        await expect(fileExists(cache.pathFor('order-1'))).resolves.toBe(true);
    });

    it('renders over an expired cache file instead of reading it', async () => {
        const target = cache.pathFor('order-1');
        await writeFile(target, Buffer.from('stale-bytes'));
        // Backdated past the 5-minute TTL, both atime and mtime — `utimes` takes both.
        const past = new Date(Date.now() - 6 * 60 * 1000);
        await utimes(target, past, past);
        const { renderInvoicePdf } = await import('../../services/invoice');

        await expect(renderInvoicePdf('order-1')).resolves.toEqual(Buffer.from('fresh-bytes'));

        expect(renderHtmlToPdfMock).toHaveBeenCalled();
    });

    it('answers undefined without writing a cache entry for an order that no longer exists', async () => {
        findByIdRawMock.mockResolvedValue(null);
        const { renderInvoicePdf } = await import('../../services/invoice');

        await expect(renderInvoicePdf('gone')).resolves.toBeUndefined();

        await expect(fileExists(cache.pathFor('gone'))).resolves.toBe(false);
    });

    // 1.2: a truncated read is only possible if the write is visible before it is complete.
    // Landing under the final name via rename rather than a direct writeFile is what this pins —
    // a leftover `.tmp` sitting beside the `.pdf` would mean the write path skipped the rename.
    it('leaves no temp file behind once the write lands', async () => {
        const { readdir } = await import('node:fs/promises');
        const { renderInvoicePdf } = await import('../../services/invoice');

        await renderInvoicePdf('order-1');

        const entries = await readdir(cache.root());
        expect(entries).toEqual(['order-1.pdf']);
    });
});

describe('deleteCachedInvoice', () => {
    const cache = withCacheRoot();

    beforeEach(() => jest.clearAllMocks());

    it('deletes the cached file and reports it deleted', async () => {
        const target = cache.pathFor('order-1');
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
    const cache = withCacheRoot();

    /** 24-hex ids shaped like real `_id`s — the only filename shape this reaper ever risks against the database. */
    const ORDER_A = '507f1f77bcf86cd799439011';
    const ORDER_B = '507f1f77bcf86cd799439012';

    beforeEach(() => jest.clearAllMocks());

    it('deletes a file whose order no longer exists, and leaves one whose order does', async () => {
        const pathA = cache.pathFor(ORDER_A);
        const pathB = cache.pathFor(ORDER_B);
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
        const strayPath = cache.pathFor('not-an-order-id');
        await writeFile(strayPath, Buffer.from('bytes'));
        const { reapOrphanedInvoices } = await import('../../services/invoice');

        await expect(reapOrphanedInvoices()).resolves.toBe(0);

        expect(existingIdsMock).not.toHaveBeenCalled();
        await expect(fileExists(strayPath)).resolves.toBe(true);
    });

    it('answers 0 without touching the database when the cache directory does not exist yet', async () => {
        await rm(cache.root(), { recursive: true, force: true });
        const { reapOrphanedInvoices } = await import('../../services/invoice');

        await expect(reapOrphanedInvoices()).resolves.toBe(0);

        expect(existingIdsMock).not.toHaveBeenCalled();
    });

    // 1.2: a `.tmp` left by a crash between the write and the rename is invisible to both sweeps
    // unless the reaper also collects it — pinned here for the orphan half, and again below for
    // the expiry half.
    it('deletes a stray temp file whose order no longer exists', async () => {
        const strayTemp = path.join(cache.root(), `${ORDER_A}.${'a'.repeat(32)}.tmp`);
        await writeFile(strayTemp, Buffer.from('partial-write'));
        existingIdsMock.mockResolvedValue(new Set());
        const { reapOrphanedInvoices } = await import('../../services/invoice');

        await expect(reapOrphanedInvoices()).resolves.toBe(1);

        expect(existingIdsMock).toHaveBeenCalledWith([ORDER_A]);
        await expect(fileExists(strayTemp)).resolves.toBe(false);
    });
});

describe('reapExpiredInvoices', () => {
    const cache = withCacheRoot();

    const ORDER_A = '507f1f77bcf86cd799439011';
    const ORDER_B = '507f1f77bcf86cd799439012';

    beforeEach(() => {
        jest.clearAllMocks();
        ttlMinutesMock.mockReturnValue(5);
    });

    afterEach(() => ttlMinutesMock.mockReturnValue(0));

    it('deletes a file past the TTL, and leaves one still fresh', async () => {
        const stale = cache.pathFor(ORDER_A);
        const fresh = cache.pathFor(ORDER_B);
        await writeFile(stale, Buffer.from('bytes'));
        await writeFile(fresh, Buffer.from('bytes'));
        const past = new Date(Date.now() - 6 * 60 * 1000);
        await utimes(stale, past, past);
        const { reapExpiredInvoices } = await import('../../services/invoice');

        await expect(reapExpiredInvoices()).resolves.toBe(1);

        await expect(fileExists(stale)).resolves.toBe(false);
        await expect(fileExists(fresh)).resolves.toBe(true);
    });

    it('answers 0 without touching the database when the cache directory does not exist yet', async () => {
        await rm(cache.root(), { recursive: true, force: true });
        const { reapExpiredInvoices } = await import('../../services/invoice');

        await expect(reapExpiredInvoices()).resolves.toBe(0);
    });

    it('deletes a stray temp file past the TTL, and leaves one still fresh', async () => {
        const staleTemp = path.join(cache.root(), `${ORDER_A}.${'a'.repeat(32)}.tmp`);
        const freshTemp = path.join(cache.root(), `${ORDER_B}.${'b'.repeat(32)}.tmp`);
        await writeFile(staleTemp, Buffer.from('partial-write'));
        await writeFile(freshTemp, Buffer.from('partial-write'));
        const past = new Date(Date.now() - 6 * 60 * 1000);
        await utimes(staleTemp, past, past);
        const { reapExpiredInvoices } = await import('../../services/invoice');

        await expect(reapExpiredInvoices()).resolves.toBe(1);

        await expect(fileExists(staleTemp)).resolves.toBe(false);
        await expect(fileExists(freshTemp)).resolves.toBe(true);
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
 * `upload.image()` wraps multer so the request's locale survives the stream being consumed (see
 * `infrastructure/http/middlewares/upload.ts`). Asserted at the unit level too, distinct from the
 * integration suite's coverage of the mounted route.
 */
describe('upload.image restores the locale', () => {
    /**
     * Returns the whole pipeline — locale-restoring wrapper, content check, then image-store
     * commit. Asserted rather than assumed: mounting only the first would accept non-image bytes,
     * and mounting only the first two would leave uploads staged with nothing pointing at them.
     */
    it('returns the full guard chain', async () => {
        const { upload } = await import('@infrastructure/http/middlewares/upload');
        const handlers = upload.image();

        expect(handlers).toHaveLength(3);
    });

    it('re-enters the request locale', async () => {
        const { upload } = await import('@infrastructure/http/middlewares/upload');
        const [localeAware] = upload.image();

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
        const [localeAware] = upload.image();

        const observed = await runMiddleware(localeAware, asStub<Request>({ headers: {} }));

        expect(observed).toBeUndefined();
    });
});
