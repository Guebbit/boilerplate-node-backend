import path from 'node:path';
import ejs from 'ejs';
import type { IPdfJobPayload } from '@types';
import { logger } from '@core/adapters/logger';
import { renderHtmlToPdf } from '@core/adapters/pdf';
import { getFallbackLocale, runWithLocale, t } from '@core/i18n';

/*
 * Queue name for PDF generation jobs
 */
export const PDF_QUEUE = 'pdfs';

/*
 * Payload shape for PDF generation jobs (re-export from AsyncAPI contract)
 */
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

    /**
     * Create PDF file using the invoice EJS template
     */
    /*
     * Same boundary as the email worker: the request that enqueued this is long gone, so the
     * AsyncLocalStorage store is gone with it and the ambient `t` would fall back to the boot
     * language. The payload's locale is put back on this chain before the template renders.
     */
    return runWithLocale(job.locale ?? getFallbackLocale(), () =>
        ejs
            .renderFile(path.resolve(job.templatePath), {
                t,
                locale: job.locale ?? getFallbackLocale(),
                ...job.templateData
            })
            .then((html) => renderHtmlToPdf(html, { format: 'A4', path: job.outputPath }))
            .then(() => {
                logger.info({ message: 'PDF generated.', outputPath: job.outputPath });
                return true;
            })
            .catch((error: Error) => {
                logger.error({ message: 'PDF worker failed.', error: error.message });
                return false;
            })
    );
};
