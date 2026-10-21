/**
 * @module
 * The one response both private PDF downloads share: the invoice and the credit note.
 */

import type { Response } from 'express';

/**
 * Sends a document's PDF bytes as a private, uncached, inline file.
 * `inline`, not `attachment`: the frontend holds the blob either way and decides what to do with
 * it — download, or a same-tab preview.
 * @param response - the Express response to answer on
 * @param filename - the name offered to the browser, extension included
 * @param pdf - the rendered bytes
 */
export const sendPdf = (response: Response, filename: string, pdf: Buffer | Uint8Array): void => {
    response
        .status(200)
        .setHeader('Content-Type', 'application/pdf')
        .setHeader('Content-Disposition', `inline; filename="${filename}"`)
        // Personal and financial data — never a shared/CDN cache, and never the browser's own
        // disk cache either.
        .setHeader('Cache-Control', 'private, no-store')
        .send(pdf);
};
