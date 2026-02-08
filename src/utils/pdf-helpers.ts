import puppeteer, { type PDFOptions } from 'puppeteer-core';
import { databaseErrorConverter } from "./error-helpers";
import type { DatabaseError, ValidationError } from "sequelize";
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
export async function createPDF (
    htmlContent: string,
    filename = 'output.pdf',
    outputPath = 'src/data/files',
    // eslint-disable-next-line unicorn/no-object-as-default-parameter
    options: PDFOptions = {
        format: 'A4',
        printBackground: true
    }
) {
    return puppeteer.launch(getBrowserConfig())
        .then(browser =>
            browser.newPage()
                .then(page =>
                    page.setContent(htmlContent, {
                            // Wait until there are no more than 0 network connections for at least 500 milliseconds:
                            // The page is considered fully loaded when there has been a half-second period with no new network requests
                            waitUntil: 'networkidle0'
                        })
                        .then(() =>
                            page.pdf({
                                    ...options,
                                    path: outputPath + '/' + filename,
                                })
                                .then(async () => {
                                    await browser.close();
                                    return outputPath + '/' + filename;
                                })
                        )
                )
                .catch(async (error: Error | ValidationError | DatabaseError) => {
                    await browser.close();
                    throw databaseErrorConverter(error);
                })
        );
}