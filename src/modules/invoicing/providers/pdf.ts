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
 * PDF: renders `buildDocumentView`'s context through {@link DOCUMENT_TEMPLATE} and prints it with
 * Puppeteer — the render locale is always the document's OWN frozen locale, never a viewer's
 * request locale, since a document is a record of what was issued, in the language it was issued
 * in.
 */
export const pdfEInvoicingProvider: EInvoicingProvider = {
    name: 'pdf',

    issue: (document) =>
        ejs
            // `root: process.cwd()` — the template's `/shared/templates/layouts/...` include is
            // root-relative, so this resolves correctly regardless of this module's own depth
            // under `src/modules`. https://ejs.co/#docs (Includes)
            .renderFile(DOCUMENT_TEMPLATE, buildDocumentView(document.locale, document), {
                root: process.cwd()
            })
            .then((html) => renderHtmlToPdf(html, { format: 'A4' }))
            .then((bytes) => ({ contentType: 'application/pdf', bytes: Buffer.from(bytes) }))
};
