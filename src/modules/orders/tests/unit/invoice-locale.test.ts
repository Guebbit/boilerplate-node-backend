import type { NextFunction, Request, Response } from 'express';
import { runWithLocale, getLocaleContext } from '@infrastructure/i18n';
import enOrders from '@modules/orders/locales/en.json';
import itOrders from '@modules/orders/locales/it.json';
import { invoiceDocument } from '../../emails';

/**
 * The invoice PDF comes out in the language its producer resolved.
 *
 * The code under test is the generic PDF worker, but the scenario is this module's: the order
 * invoice is the only document the app renders, and the copy it must come out in is this module's
 * dictionary. It lives here so that deleting `orders` takes the template, the copy and this spec
 * together, rather than leaving a worker test asserting against strings that no longer exist.
 *
 * `invoiceDocument` resolves the copy up front and the worker only interpolates, so the guard
 * runs in that direction: prove the worker cannot re-colour a document it was handed. An ambient
 * `t` resolving against the boot language instead would fail silently — nothing throws, and
 * nothing looks wrong in a test written in English.
 *
 * The second half of this file covers the upload chain, which still re-enters the locale by hand
 * because multer consumes the stream mid-request — the one place an in-request store must be
 * restored rather than avoided.
 */

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

/** The HTML handed to the (mocked) PDF renderer. */
const renderedHtml = () => renderHtmlToPdfMock.mock.calls[0][0] as string;

/**
 * A job as a producer would publish it: the builder's output, unmodified. No locale field on the
 * envelope — the only trace of the language is the `<html lang>` value inside the copy.
 */
const invoiceJob = (locale = 'en') => ({
    templatePath: 'views/templates-files/invoice-order-file.ejs',
    outputPath: '/tmp/invoice-test.pdf',
    templateData: invoiceDocument(locale, {
        _id: 'an-order-id',
        items: [{ product: { title: 'A product', price: 10 }, quantity: 2 }]
    })
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

describe('the PDF worker renders the copy it was given', () => {
    beforeEach(() => jest.clearAllMocks());

    it('renders the Italian copy an Italian request produced', async () => {
        const { handlePdfJob } = await import('@infrastructure/adapters/pdf.worker');

        await expect(handlePdfJob(invoiceJob('it'))).resolves.toBe(true);

        expect(renderedHtml()).toContain(escaped(itOrders.orders.invoice.title));
        expect(renderedHtml()).toContain('<html lang="it"');
    });

    it('renders English copy as English', async () => {
        const { handlePdfJob } = await import('@infrastructure/adapters/pdf.worker');

        await expect(handlePdfJob(invoiceJob('en'))).resolves.toBe(true);

        expect(renderedHtml()).toContain(escaped(enOrders.orders.invoice.title));
    });

    /**
     * The point of the design: draining a queue from inside an unrelated locale scope cannot
     * colour the output, because the worker never consults a dictionary at all.
     */
    it('ignores the ambient locale entirely', async () => {
        const { handlePdfJob } = await import('@infrastructure/adapters/pdf.worker');

        await runWithLocale('en', () => handlePdfJob(invoiceJob('it')));

        expect(renderedHtml()).toContain(escaped(itOrders.orders.invoice.title));
    });

    it('discards a malformed job rather than rendering one', async () => {
        const { handlePdfJob } = await import('@infrastructure/adapters/pdf.worker');

        await expect(handlePdfJob({ outputPath: '/tmp/x.pdf' })).resolves.toBe(false);

        expect(renderHtmlToPdfMock).not.toHaveBeenCalled();
    });

    it('nacks rather than throwing when rendering fails', async () => {
        renderHtmlToPdfMock.mockRejectedValueOnce(new Error('puppeteer died'));
        const { handlePdfJob } = await import('@infrastructure/adapters/pdf.worker');

        await expect(handlePdfJob(invoiceJob('it'))).resolves.toBe(false);
    });
});

/**
 * `upload` wraps every multer method so the request's locale survives the stream being consumed
 * (see `infrastructure/adapters/storage.ts`). The integration suite proves it for the one method the routes
 * actually mount; this proves the wrapper is applied uniformly, so a route that later reaches for
 * `upload.fields()` does not quietly lose the language.
 */
describe('every upload method restores the locale', () => {
    const methods = ['single', 'array', 'fields', 'none', 'any'] as const;

    /**
     * Each method returns the whole pipeline — the locale-restoring multer wrapper, then the
     * content check, then the commit to the image store. Asserted rather than assumed, because a
     * route mounting only the first would type-check and silently accept a file whose bytes are
     * not an image, and one mounting only the first two would leave every upload staged in a temp
     * directory with nothing ever pointing at it.
     */
    it.each(methods)('upload.%s returns the full guard chain', async (method) => {
        const { upload } = await import('@infrastructure/adapters/storage');
        const handlers =
            method === 'fields' ? upload.fields([]) : (upload[method] as () => unknown[])();

        expect(handlers).toHaveLength(3);
    });

    it.each(methods)('upload.%s re-enters the request locale', async (method) => {
        const { upload } = await import('@infrastructure/adapters/storage');
        const [localeAware] =
            method === 'fields' ? upload.fields([]) : (upload[method] as () => unknown[])();

        const observed = await runMiddleware(localeAware, {
            locale: 'it',
            headers: {}
        } as unknown as Request);

        expect(observed).toBe('it');
    });

    it('leaves the chain alone when no locale was negotiated', async () => {
        const { upload } = await import('@infrastructure/adapters/storage');
        const [localeAware] = upload.none();

        const observed = await runMiddleware(localeAware, { headers: {} } as unknown as Request);

        expect(observed).toBeUndefined();
    });
});
