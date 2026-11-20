/**
 * @module
 * The default e-invoicing provider — renders a PDF through the same EJS + Chromium pipeline
 * `orders` used for its own receipt (`renderHtmlToPdf`, `@infrastructure/adapters/pdf`), the only
 * shipped implementation of the port in `./index.ts`.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ejs from 'ejs';
import { renderHtmlToPdf } from '@infrastructure/adapters/pdf';
import { buildDocumentFooter, buildDocumentView } from '../emails';
import type { EInvoicingProvider } from './index';

/**
 * The EJS template every render — invoice or credit note — prints through, owned by this module
 * rather than by `shared/templates` — deleting `invoicing` now deletes it too.
 *
 * Under `templates/documents/`, one level deeper than a module's OTHER templates: nothing ever
 * resolves this file BY NAME (unlike an `EmailContent.template`, which travels through a queue as
 * a bare string), so it stays out of `mailer.ts#registerTemplateDirectories`' non-recursive
 * collection — reached directly here instead, the way it always was.
 */
const DOCUMENT_TEMPLATE = path.join(
    __dirname,
    '..',
    'templates',
    'documents',
    'invoicing.document.ejs'
);

/**
 * The logo printed in every document's header, as a `data:` URI.
 *
 * The renderer refuses every request that is not a `data:` one (`refuseNonDataRequest`), so the
 * image travels inside the HTML. Read once, on the first render, and kept: the file never changes
 * while the process runs. A failed read is not kept, so the next render tries again.
 * @see docs/modules/invoicing.md#the-pdf
 */
let logoDataUri: Promise<string> | undefined;

/** The memoised {@link logoDataUri}, read on first use. */
const readLogo = (): Promise<string> => {
    logoDataUri ??= readFile(path.join(path.dirname(DOCUMENT_TEMPLATE), 'logo.svg'), 'base64')
        .then((encoded) => `data:image/svg+xml;base64,${encoded}`)
        .catch((error: unknown) => {
            logoDataUri = undefined;
            throw error;
        });
    return logoDataUri;
};

/**
 * Print geometry for `page.pdf()`. `printBackground` is on because the design's tinted banner,
 * chips and totals card are backgrounds, which Chromium drops from print by default. The bottom
 * margin holds the page footer, which Chromium repeats on every page.
 * https://pptr.dev/api/puppeteer.pdfoptions
 *
 * @param footer - the already-translated footer line, escaped here for the footer's HTML
 */
const printOptions = (footer: string) =>
    ({
        format: 'A4',
        printBackground: true,
        margin: { top: '16mm', right: '16mm', bottom: '20mm', left: '16mm' },
        // Chromium prints its own date and title in the header unless it is given an empty one.
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        // Chromium gives a footer no font size and no page margin: both are set inline.
        footerTemplate: `<div style="width: 100%; margin: 0 16mm; padding-top: 3pt; border-top: 0.75pt solid #e0e0e0; font-family: 'DejaVu Sans', Arial, sans-serif; font-size: 7pt; color: #9e9e9e;">${ejs.escapeXML(footer)}</div>`
    }) as const;

/**
 * PDF: renders `buildDocumentView`'s context through {@link DOCUMENT_TEMPLATE} and prints it with
 * Puppeteer — the render locale is always the document's OWN frozen locale, never a viewer's
 * request locale, since a document is a record of what was issued, in the language it was issued
 * in.
 */
export const pdfEInvoicingProvider: EInvoicingProvider = {
    name: 'pdf',

    render: (document) =>
        readLogo()
            .then((logo) =>
                // EJS: render the file with this context. https://ejs.co/#docs
                ejs.renderFile(
                    DOCUMENT_TEMPLATE,
                    { ...buildDocumentView(document.locale, document), logoDataUri: logo },
                    // `root` resolves the root-relative `include("/...")` paths from the project root.
                    { root: process.cwd() }
                )
            )
            .then((html) =>
                renderHtmlToPdf(html, printOptions(buildDocumentFooter(document.locale, document)))
            )
            .then((bytes) => Buffer.from(bytes))
};
