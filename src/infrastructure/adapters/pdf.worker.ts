/**
 * @module
 * Drains one queued PDF job: render the EJS template to HTML, then rasterize it via
 * `renderHtmlToPdf` and write the result to the requested path.
 *
 * Same split as `email.worker.ts` — a malformed payload dead-letters, a failed render is left to
 * reject so `consumeFromQueue` requeues it.
 *
 * See: docs/tools/email-and-rendering.md
 */

import path from 'node:path';
import ejs from 'ejs';
import type { PdfJobPayload } from '@types';
import { logger } from '@infrastructure/adapters/logger';
import { renderHtmlToPdf } from '@infrastructure/adapters/pdf';

/* Queue name for PDF jobs — owned by the adapter, re-exported for the worker registry. */
export { PDF_QUEUE } from '@infrastructure/adapters/queue';

/**
 * Process a single PDF generation job from the queue.
 * Renders an EJS template to HTML, then uses Puppeteer to produce a PDF file.
 *
 * Same split as `handleEmailJob`: `false` only for a payload naming no template or destination. A
 * failed render is left to reject, so the broker retries it.
 *
 * Typed parameter, `Partial` because it came off a broker — see `handleEmailJob` for the reasoning.
 */
export const handlePdfJob = (job: Partial<PdfJobPayload>): Promise<boolean> => {
    // Both ends of the render: what to render, and where to write it. The check narrows on its
    // own — see the same guard in `email.worker.ts`.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the payload crossed a queue: its type is a claim, not a fact
    if (!job?.templatePath || !job.outputPath) {
        logger.warn({ message: 'Invalid PDF job payload, discarding.', job });
        return Promise.resolve(false);
    }

    /*
     * Render the template and write the PDF. Like the email worker, this touches no i18n: the
     * producer resolved the document's copy — `templateData` is finished text, including the
     * `locale` the markup needs for `<html lang>` — so the render context is exactly what the
     * job carried, and nothing here has to know which language it is looking at.
     */
    return ejs
        .renderFile(path.resolve(job.templatePath), { ...job.templateData })
        .then((html) => renderHtmlToPdf(html, { format: 'A4', path: job.outputPath }))
        .then(() => {
            logger.info({ message: 'PDF generated.', outputPath: job.outputPath });
            return true;
        })
        .catch((error: Error) => {
            logger.error({ message: 'PDF worker failed.', error: error.message });
            throw error;
        });
};
