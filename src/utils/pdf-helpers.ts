import puppeteer, { type PDFOptions } from 'puppeteer-core';
import { getBrowserConfig } from "./puppeteer.config";

/**
 * Creates a PDF from HTML content
 *
 * @param htmlContent
 * @param filename
 * @param outputPath
 * @param options - puppeteer options
 * @return string | Error
 */
export async function createPDF(
    htmlContent: string,
    filename = 'output.pdf',
    outputPath = 'src/storage/files',
    // eslint-disable-next-line unicorn/no-object-as-default-parameter
    options: PDFOptions = {
        format: 'A4',
        printBackground: true
    }
): Promise<string> {
    const browser = await puppeteer.launch(getBrowserConfig());
    try {
        const page = await browser.newPage();
        // Wait until there are no more than 0 network connections for at least 500 milliseconds:
        // The page is considered fully loaded when there has been a half-second period with no new network requests
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        await page.pdf({
            ...options,
            path: outputPath + '/' + filename,
        });
        return outputPath + '/' + filename;
    } finally {
        await browser.close();
    }
}