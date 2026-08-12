import path from 'node:path';
import ejs from 'ejs';
import type { IPdfJobPayload } from '@types';
import { logger } from '@infrastructure/adapters/logger';
import { renderHtmlToPdf } from '@infrastructure/adapters/pdf';

/* Queue name for PDF jobs — owned by the adapter, re-exported for the worker registry. */
export { PDF_QUEUE } from '@infrastructure/adapters/queue';

/**
 * Process a single PDF generation job from the queue.
 * Renders an EJS template to HTML, then uses Puppeteer to produce a PDF file.
 *
 * Typed parameter, `Partial` because it came off a broker — see `handleEmailJob` for the reasoning.
 */
export const handlePdfJob = (job: Partial<IPdfJobPayload>): Promise<boolean> => {
    // Both ends of the render: what to render, and where to write it. The check narrows on its
    // own — see the same guard in `email.worker.ts`.
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
            return false;
        });
};
