/**
 * @module
 * HTML → PDF rendering (invoices, reports).
 *
 * See: docs/tools/email-and-rendering.md
 */

// `puppeteer-core`, not `puppeteer`: the -core package skips the ~150 MB Chromium download at
// install time and expects an externally provided browser binary. That is the right choice for
// container images, where the base image installs chromium via the package manager.
import puppeteer from 'puppeteer-core';
// Page-geometry options for `page.pdf()` (format, margins, landscape, printBackground, ...).
import type { PDFOptions } from 'puppeteer-core';

/** A4 portrait — the default for invoices. Override per call when a document needs otherwise. */
const DEFAULT_PDF_OPTIONS: PDFOptions = { format: 'A4' };

/**
 * Shared Puppeteer launch options for PDF rendering.
 *
 * A function rather than a constant so `process.env` is read at call time — which keeps tests
 * able to point the path elsewhere after this module has been imported.
 */
const launchOptions = () => ({
    // Path to the Chromium binary. Must be set (or match the fallback) because puppeteer-core
    // ships no browser of its own; the fallback is the Alpine/Debian package location.
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium-browser',
    args: [
        // Chromium's sandbox needs kernel privileges most containers do not grant, so it fails
        // to launch without this. Safe *only* because the HTML rendered here is our own
        // templates — passing untrusted HTML through an unsandboxed browser is a real risk.
        '--no-sandbox',
        // Disables the setuid sandbox helper for the same reason.
        '--disable-setuid-sandbox'
    ]
});

/**
 * Render HTML content to a PDF buffer using headless Chromium.
 *
 * Launches a full browser process per call — hundreds of milliseconds and real memory. Fine for
 * on-demand invoices; a pooled long-lived browser would be the next step if this ever hits a hot path.
 *
 * @param html - the already-rendered HTML to print (e.g. an EJS template's output)
 * @param pdfOptions - `page.pdf()` geometry options; defaults to A4 portrait
 * @returns the rendered PDF's bytes
 */
export const renderHtmlToPdf = (
    html: string,
    pdfOptions: PDFOptions = DEFAULT_PDF_OPTIONS
): Promise<Uint8Array> =>
    // `launch` spawns the Chromium process and connects over the DevTools protocol.
    puppeteer.launch(launchOptions()).then((browser) =>
        browser
            // A fresh tab. Isolated per render, so concurrent calls cannot see each other's DOM.
            .newPage()
            .then((page) =>
                page
                    // `setContent` writes the HTML directly instead of navigating to a URL —
                    // no local web server needed.
                    .setContent(html, {
                        // Wait until there have been no network connections for 500 ms, so
                        // referenced images/fonts/CSS are actually loaded before we print.
                        // Without this, remote assets routinely render as blanks.
                        waitUntil: 'networkidle0'
                    })
                    // Prints to a PDF byte array (not a file) so the caller decides whether to
                    // stream it, attach it to an email, or persist it.
                    .then(() => page.pdf(pdfOptions))
            )
            // `finally` is essential: without it a render error would leak the Chromium process,
            // and repeated failures would exhaust the container's memory.
            .finally(() => browser.close())
    );
