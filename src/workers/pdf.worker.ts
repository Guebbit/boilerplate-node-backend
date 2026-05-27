import path from 'node:path';
import ejs from 'ejs';
import type { IPdfJobPayload } from '@types';
import { logger } from '@utils/winston';
import { renderHtmlToPdf } from '@utils/helpers-pdf';

/** Queue name for PDF generation jobs. */
export const PDF_QUEUE = 'pdfs';

/** Payload shape for PDF generation jobs (re-export from AsyncAPI contract). */
export type IPdfJob = IPdfJobPayload;

/**
 * Process a single PDF generation job from the queue.
 * Renders an EJS template to HTML, then uses Puppeteer to produce a PDF file.
 */
export const handlePdfJob = (message: unknown): Promise<boolean> => {
    const job = message as IPdfJob;

    if (!job?.templatePath || !job?.outputPath) {
        logger.warn({ message: 'Invalid PDF job payload, discarding.', job });
        return Promise.resolve(false);
    }

    const resolvedTemplate = path.resolve(job.templatePath);

    return ejs
        .renderFile(resolvedTemplate, job.templateData ?? {})
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
