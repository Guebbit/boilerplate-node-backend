import puppeteer, {type PDFOptions} from 'puppeteer';

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
    outputPath = 'src/data/files',
    options: PDFOptions = {
        format: 'A4',
        printBackground: true
    }) {
    return puppeteer.launch()
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
                                .then(() => {
                                    browser.close();
                                    return outputPath + '/' + filename;
                                })
                        )
                )
                .catch((error) => {
                    browser.close();
                    throw error;
                })
        )
}