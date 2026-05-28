import puppeteer from 'puppeteer-core';
import type { PDFOptions } from 'puppeteer-core';

const DEFAULT_PDF_OPTIONS: PDFOptions = { format: 'A4' };

/**
 * Shared Puppeteer launch options for PDF rendering.
 */
const launchOptions = () => ({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
});

/**
 * Render HTML content to a PDF buffer using headless Chromium.
 * Consolidates the duplicated Puppeteer launch/render/close pattern.
 */
export const renderHtmlToPdf = (
    html: string,
    pdfOptions: PDFOptions = DEFAULT_PDF_OPTIONS
): Promise<Uint8Array> =>
    puppeteer.launch(launchOptions()).then((browser) =>
        browser
            .newPage()
            .then((page) =>
                page
                    .setContent(html, { waitUntil: 'networkidle0' })
                    .then(() => page.pdf(pdfOptions))
            )
            .finally(() => browser.close())
    );
