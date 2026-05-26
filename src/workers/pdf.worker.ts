import path from 'node:path';
import ejs from 'ejs';
import puppeteer from 'puppeteer-core';
import { logger } from '@utils/winston';

/** Queue name for PDF generation jobs. */
export const PDF_QUEUE = 'pdfs';

/** Payload shape for PDF generation jobs. */
export interface IPdfJob {
    templatePath: string;
    templateData: Record<string, unknown>;
    outputPath: string;
}

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
        .then((html) =>
            puppeteer
                .launch({
                    executablePath:
                        process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium-browser',
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                })
                .then((browser) =>
                    browser
                        .newPage()
                        .then((page) =>
                            page
                                .setContent(html, { waitUntil: 'networkidle0' })
                                .then(() => page.pdf({ format: 'A4', path: job.outputPath }))
                        )
                        .finally(() => browser.close())
                )
        )
        .then(() => {
            logger.info({ message: 'PDF generated.', outputPath: job.outputPath });
            return true;
        })
        .catch((error: Error) => {
            logger.error({ message: 'PDF worker failed.', error: error.message });
            return false;
        });
};
