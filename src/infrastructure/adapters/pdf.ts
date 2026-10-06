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
import type { Browser, HTTPRequest, PDFOptions } from 'puppeteer-core';
import { settleWithin } from '@infrastructure/runtime/settle';
import { ServiceBusyError } from '@infrastructure/runtime/busy';
import { pdfConfig } from '@infrastructure/adapters/config';

/** A4 portrait — the default for invoices. Override per call when a document needs otherwise. */
const DEFAULT_PDF_OPTIONS: PDFOptions = { format: 'A4' };

/**
 * Shared Puppeteer launch options for PDF rendering.
 *
 * A function rather than a constant so the configuration is read at call time — which keeps tests
 * able to point the path elsewhere after this module has been imported.
 */
const launchOptions = () => ({
    // Path to the Chromium binary. Must be set (or match the fallback) because puppeteer-core
    // ships no browser of its own; the fallback is the Alpine/Debian package location.
    executablePath: pdfConfig().PUPPETEER_EXECUTABLE_PATH,
    // Launching alone may not take the whole budget: a Chromium that never starts is a render that
    // never finishes. https://pptr.dev/api/puppeteer.launchoptions
    timeout: RENDER_TIMEOUT_MS,
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
 * How many Chromium processes may run at once in this process. Each render launches its own
 * browser (hundreds of MB); the per-caller rate limit bounds one customer, not a burst across
 * many, so without this cap a burst of invoice requests can exhaust the container's memory.
 */
const MAX_CONCURRENT_RENDERS = 2;

/**
 * How many renders may WAIT for one of those slots. Past it a new render is refused at once
 * (`ServiceBusyError`, a 503 with `Retry-After`) instead of queueing without limit: an unbounded
 * queue is memory and latency a burst can grow at will, and every request in it holds a
 * connection. Twenty is about forty seconds of work at the render timeout below.
 */
export const MAX_WAITING_RENDERS = 20;

/**
 * The longest ONE render (launch, load, print) may take, in ms. A hung Chromium would otherwise
 * hold a slot, and with it every render behind it, for as long as it likes: puppeteer's own
 * per-step defaults (30 s each) are not a total. When it runs out the browser is closed and the
 * slot freed.
 */
export const RENDER_TIMEOUT_MS = 20_000;

/** A render took longer than {@link RENDER_TIMEOUT_MS}; its browser was closed. */
export class RenderTimeoutError extends Error {
    constructor() {
        super(`PDF render exceeded ${String(RENDER_TIMEOUT_MS)} ms`);
        this.name = 'RenderTimeoutError';
    }
}

/** Every render started and not yet finished — what {@link settleRenders} waits for. */
const inFlight = new Set<Promise<Uint8Array>>();

/** Renders running now — see {@link MAX_CONCURRENT_RENDERS}. */
let running = 0;

/** Renders waiting for a slot, oldest first. */
const waiting: (() => void)[] = [];

/**
 * Take a render slot: at once when one is free, otherwise once a finishing render hands its own
 * over. Counted synchronously, so a burst of calls on one tick cannot all see a free slot.
 */
const acquireSlot = (): Promise<void> => {
    if (running < MAX_CONCURRENT_RENDERS) {
        running += 1;
        return Promise.resolve();
    }
    return new Promise((resolve) => waiting.push(resolve));
};

/** Hand the slot to the oldest waiter, or free it when nobody waits. */
const releaseSlot = (): void => {
    const next = waiting.shift();
    if (next) next();
    else running -= 1;
};

/**
 * Run `task` inside a render slot, and release it however the task ends. A tiny counting
 * semaphore rather than a dependency: its only edge case is releasing on failure.
 *
 * Refuses BEFORE taking or queueing anything when every slot is busy and {@link MAX_WAITING_RENDERS}
 * are already waiting: a refused render must not release a slot it never held.
 *
 * @param task - the render to run
 * @throws {ServiceBusyError} (as a rejection) when the queue is full
 */
const withRenderSlot = <T>(task: () => Promise<T>): Promise<T> => {
    if (running >= MAX_CONCURRENT_RENDERS && waiting.length >= MAX_WAITING_RENDERS)
        return Promise.reject(new ServiceBusyError('The PDF render queue is full.'));
    return acquireSlot().then(task).finally(releaseSlot);
};

/**
 * Render HTML content to a PDF buffer using headless Chromium.
 *
 * Launches a full browser process per call — hundreds of milliseconds and real memory — at most
 * {@link MAX_CONCURRENT_RENDERS} at a time. Fine for on-demand invoices; a pooled long-lived
 * browser would be the next step if this ever hits a hot path.
 *
 * @param html - the already-rendered HTML to print (e.g. an EJS template's output)
 * @param pdfOptions - `page.pdf()` geometry options; defaults to A4 portrait
 * @returns the rendered PDF's bytes
 */
export const renderHtmlToPdf = (
    html: string,
    pdfOptions: PDFOptions = DEFAULT_PDF_OPTIONS
): Promise<Uint8Array> => {
    const render = withRenderSlot(() => renderOnce(html, pdfOptions));
    inFlight.add(render);
    // Both branches: a rejected render is still finished. `then(f, f)` rather than `finally`,
    // which would hand back a second promise rejecting with nobody listening.
    const forget = () => inFlight.delete(render);
    render.then(forget, forget);
    return render;
};

/**
 * Wait for every render already started, up to `timeoutMs` — the shutdown step that keeps an
 * exiting process from orphaning the Chromium it launched.
 *
 * Why it exists: an invoice render is often fire-and-forget (the placed-order email attaches
 * one). A process that exits mid-render — a seeding script, a worker stopped on deploy — leaves
 * that browser running with no parent, and its ~120 MB temporary profile on disk. `close()` in
 * `renderOnce` only runs if the process lives long enough to reach it.
 *
 * @param timeoutMs - the most it may wait; a hung render must not hold shutdown hostage
 * @returns resolves once every render has finished, or the time is up
 */
export const settleRenders = (timeoutMs: number): Promise<void> =>
    settleWithin(inFlight, timeoutMs);

/**
 * One render: launch, print, close — see {@link renderHtmlToPdf}.
 *
 * @param html - the already-rendered HTML to print
 * @param pdfOptions - `page.pdf()` geometry options
 */
const renderOnce = (html: string, pdfOptions: PDFOptions): Promise<Uint8Array> =>
    // `launch` spawns the Chromium process and connects over the DevTools protocol.
    puppeteer
        .launch(launchOptions())
        .then((browser) => withDeadline(browser, printIn(browser, html, pdfOptions)));

/**
 * Race a render against {@link RENDER_TIMEOUT_MS}, and close the browser however it ends.
 *
 * On the deadline the browser is closed at once (which kills the process, hung or not) and the
 * render rejects with {@link RenderTimeoutError}; the work still pending behind it can only fail
 * against a closed browser, and the race has already attached a handler to it.
 *
 * @param browser - the launched browser this render owns
 * @param work - the render's own promise
 */
const withDeadline = (browser: Browser, work: Promise<Uint8Array>): Promise<Uint8Array> => {
    let timer: NodeJS.Timeout | undefined;
    let timedOut = false;
    const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
            timedOut = true;
            // The close of a hung browser may itself reject; the timeout is the answer that matters.
            void browser.close().catch(() => undefined);
            reject(new RenderTimeoutError());
        }, RENDER_TIMEOUT_MS);
    });

    return (
        Promise.race([work, deadline])
            // `finally` is essential: without it a render error would leak the Chromium process,
            // and repeated failures would exhaust the container's memory. Skipped once the deadline
            // closed it, so a browser is never closed twice.
            .finally(() => {
                clearTimeout(timer);
                return timedOut ? undefined : browser.close();
            })
    );
};

/**
 * Refuses every request the page makes except an inline `data:` URL.
 *
 * The templates fetch nothing from the network, so a template injection that plants an
 * `<img src>` or `<link>` cannot turn the renderer into an SSRF probe of the host's network.
 *
 * @param request - the intercepted puppeteer request
 */
export const refuseNonDataRequest = (
    request: Pick<HTTPRequest, 'url' | 'abort' | 'continue'>
): void => {
    const answer = request.url().startsWith('data:') ? request.continue() : request.abort();
    // A request answered after the page closed rejects; nothing is left to protect then.
    answer.catch(() => undefined);
};

/**
 * Open a tab on `browser`, load the HTML and print it.
 *
 * @param browser - the launched browser
 * @param html - the already-rendered HTML to print
 * @param pdfOptions - `page.pdf()` geometry options
 */
const printIn = (browser: Browser, html: string, pdfOptions: PDFOptions): Promise<Uint8Array> =>
    Promise.resolve(
        browser
            // A fresh tab. Isolated per render, so concurrent calls cannot see each other's DOM.
            .newPage()
            .then((page) =>
                page
                    // The templates run no script, and the browser runs unsandboxed (see
                    // `launchOptions`): turning JavaScript off takes away what a template
                    // injection could do with that. https://pptr.dev/api/puppeteer.page.setjavascriptenabled
                    .setJavaScriptEnabled(false)
                    // Every request now waits for `refuseNonDataRequest` to answer it.
                    // https://pptr.dev/api/puppeteer.page.setrequestinterception
                    .then(() => page.setRequestInterception(true))
                    .then(() => {
                        page.on('request', refuseNonDataRequest);
                    })
                    // `setContent` writes the HTML directly instead of navigating to a URL —
                    // no local web server needed.
                    .then(() =>
                        page.setContent(html, {
                            /*
                             * Wait for the `load` event, which fires once images, stylesheets and
                             * subframes have finished — so referenced assets are painted, not blank.
                             * The only stronger option, `networkidle0`, is not available here:
                             * puppeteer 25 excludes it from `setContent`, which does not navigate.
                             * What `load` misses is a resource a SCRIPT fetches afterwards, and these
                             * templates run none.
                             * https://pptr.dev/api/puppeteer.page.setcontent
                             */
                            waitUntil: 'load'
                        })
                    )
                    // Prints to a PDF byte array (not a file) so the caller decides whether to
                    // stream it, attach it to an email, or persist it.
                    .then(() => page.pdf(pdfOptions))
            )
    );
