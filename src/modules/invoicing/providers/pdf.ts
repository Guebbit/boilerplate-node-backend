/**
 * @module
 * The default e-invoicing provider — renders a PDF through the same EJS + Chromium pipeline
 * `orders` used for its own receipt (`renderHtmlToPdf`, `@infrastructure/adapters/pdf`), the only
 * shipped implementation of the port in `./index.ts`.
 */

import path from 'node:path';
import ejs from 'ejs';
import { renderHtmlToPdf } from '@infrastructure/adapters/pdf';
import { buildDocumentView } from '../emails';
import type { EInvoicingProvider } from './index';

/** The EJS template every render — invoice or credit note — prints through. */
const DOCUMENT_TEMPLATE = path.resolve(
    'shared',
    'templates',
    'documents',
    'invoicing.document.ejs'
);

/**
 * PDF: renders `buildDocumentView`'s context through {@link DOCUMENT_TEMPLATE} and prints it with
 * Puppeteer — the render locale is always the document's OWN frozen locale, never a viewer's
 * request locale, since a document is a record of what was issued, in the language it was issued
 * in.
 */
export const pdfEInvoicingProvider: EInvoicingProvider = {
    name: 'pdf',

    issue: (document) =>
        ejs
            .renderFile(DOCUMENT_TEMPLATE, buildDocumentView(document.locale, document))
            .then((html) => renderHtmlToPdf(html, { format: 'A4' }))
            .then((bytes) => ({ contentType: 'application/pdf', bytes: Buffer.from(bytes) }))
};
