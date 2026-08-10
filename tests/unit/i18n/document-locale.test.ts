import type { NextFunction, Request, Response } from 'express';
import { runWithLocale, getLocaleContext } from '@core/i18n';
import enTranslation from '../../../src/locales/en.json';
import itTranslation from '../../../src/locales/it.json';

/**
 * The two remaining places the request's locale has to be re-established by hand.
 *
 * Both are the same failure: the ambient `t` silently resolves against the boot language and
 * nothing throws, logs, or looks wrong in a test written in English. The email worker is covered
 * in `email-locale.test.ts`; this covers its two siblings.
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
jest.mock('@core/adapters/pdf', () => ({
    renderHtmlToPdf: (html: string, options?: unknown) => renderHtmlToPdfMock(html, options)
}));

/** The HTML handed to the (mocked) PDF renderer. */
const renderedHtml = () => renderHtmlToPdfMock.mock.calls[0][0] as string;

const invoiceJob = (locale?: string) => ({
    templatePath: 'views/templates-files/invoice-order-file.ejs',
    outputPath: '/tmp/invoice-test.pdf',
    templateData: {
        pageMetaTitle: 'Invoice',
        pageMetaLinks: [],
        order: { items: [{ product: { title: 'A product', price: 10 }, quantity: 2 }] }
    },
    ...(locale ? { locale } : {})
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

describe('the PDF worker renders in the payload’s locale', () => {
    beforeEach(() => jest.clearAllMocks());

    it('renders Italian for an Italian job', async () => {
        const { handlePdfJob } = await import('../../../src/workers/pdf.worker');

        await expect(handlePdfJob(invoiceJob('it'))).resolves.toBe(true);

        expect(renderedHtml()).toContain(escaped(itTranslation.invoice.title));
        expect(renderedHtml()).toContain('<html lang="it"');
    });

    it('falls back rather than failing when a job carries no locale', async () => {
        const { handlePdfJob } = await import('../../../src/workers/pdf.worker');

        await expect(handlePdfJob(invoiceJob())).resolves.toBe(true);

        expect(renderedHtml()).toContain(escaped(enTranslation.invoice.title));
    });

    /**
     * The job's locale must win over whatever happened to be ambient when the worker was
     * invoked — draining a queue from inside an unrelated scope must not colour the output.
     */
    it('ignores any ambient locale and uses the job’s own', async () => {
        const { handlePdfJob } = await import('../../../src/workers/pdf.worker');

        await runWithLocale('en', () => handlePdfJob(invoiceJob('it')));

        expect(renderedHtml()).toContain(escaped(itTranslation.invoice.title));
    });

    it('discards a malformed job rather than rendering one', async () => {
        const { handlePdfJob } = await import('../../../src/workers/pdf.worker');

        await expect(handlePdfJob({ outputPath: '/tmp/x.pdf' })).resolves.toBe(false);

        expect(renderHtmlToPdfMock).not.toHaveBeenCalled();
    });

    it('nacks rather than throwing when rendering fails', async () => {
        renderHtmlToPdfMock.mockRejectedValueOnce(new Error('puppeteer died'));
        const { handlePdfJob } = await import('../../../src/workers/pdf.worker');

        await expect(handlePdfJob(invoiceJob('it'))).resolves.toBe(false);
    });
});

/**
 * `upload` wraps every multer method so the request's locale survives the stream being consumed
 * (see `core/adapters/storage.ts`). The integration suite proves it for the one method the routes
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
        const { upload } = await import('@core/adapters/storage');
        const handlers =
            method === 'fields' ? upload.fields([]) : (upload[method] as () => unknown[])();

        expect(handlers).toHaveLength(3);
    });

    it.each(methods)('upload.%s re-enters the request locale', async (method) => {
        const { upload } = await import('@core/adapters/storage');
        const [localeAware] =
            method === 'fields' ? upload.fields([]) : (upload[method] as () => unknown[])();

        const observed = await runMiddleware(localeAware, {
            locale: 'it',
            headers: {}
        } as unknown as Request);

        expect(observed).toBe('it');
    });

    it('leaves the chain alone when no locale was negotiated', async () => {
        const { upload } = await import('@core/adapters/storage');
        const [localeAware] = upload.none();

        const observed = await runMiddleware(localeAware, { headers: {} } as unknown as Request);

        expect(observed).toBeUndefined();
    });
});
