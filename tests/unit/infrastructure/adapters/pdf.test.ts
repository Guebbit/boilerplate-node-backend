/**
 * The HTML → PDF adapter.
 *
 * A suite can reach this adapter without asserting anything true about it — reachability isn't
 * validation. What it holds is not rendering — that is Chromium's — but four decisions that are
 * only observable from outside:
 *
 *   - the browser binary is resolved at CALL time, so an environment set after import still counts;
 *   - the two `--no-sandbox` flags, which are a deliberate risk accepted for our own templates;
 *   - `waitUntil: 'load'`, without which referenced assets print as blanks;
 *   - `finally`, which closes the browser even when the render throws. That one is the reason this
 *     file is worth testing at all: a leaked Chromium per failed invoice exhausts the container.
 *
 * `puppeteer-core` is mocked, so no browser is launched and none needs to be installed.
 */
const pdfBuffer = new Uint8Array([37, 80, 68, 70]);

const pdf = jest.fn((_options?: unknown) => Promise.resolve(pdfBuffer));
const setContent = jest.fn((_html?: string, _options?: unknown) => Promise.resolve());
const close = jest.fn(() => Promise.resolve());
const setJavaScriptEnabled = jest.fn((_enabled?: boolean) => Promise.resolve());
const newPage = jest.fn(() => Promise.resolve({ setContent, pdf, setJavaScriptEnabled }));
const launch = jest.fn((_options?: unknown) => Promise.resolve({ newPage, close }));

jest.mock('puppeteer-core', () => ({
    __esModule: true,
    default: {
        launch: (options: unknown) => launch(options)
    }
}));

import { renderHtmlToPdf, settleRenders } from '@infrastructure/adapters/pdf';

/** The options object handed to the last `puppeteer.launch` call. */
const lastLaunchOptions = () =>
    launch.mock.calls.at(-1)?.[0] as { executablePath: string; args: string[] };

describe('renderHtmlToPdf', () => {
    const previousExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH;

    afterEach(() => {
        if (previousExecutablePath === undefined) delete process.env.PUPPETEER_EXECUTABLE_PATH;
        else process.env.PUPPETEER_EXECUTABLE_PATH = previousExecutablePath;
    });

    describe('the browser it launches', () => {
        it('reads PUPPETEER_EXECUTABLE_PATH at call time, not at import time', async () => {
            process.env.PUPPETEER_EXECUTABLE_PATH = '/opt/chrome/chrome';

            await renderHtmlToPdf('<p>hello</p>');

            expect(lastLaunchOptions().executablePath).toBe('/opt/chrome/chrome');
        });

        it('falls back to the distribution package path when the variable is unset', async () => {
            delete process.env.PUPPETEER_EXECUTABLE_PATH;

            await renderHtmlToPdf('<p>hello</p>');

            // puppeteer-core ships no browser of its own, so an absent path is not "use the default"
            expect(lastLaunchOptions().executablePath).toBe('/usr/bin/chromium-browser');
        });

        it('disables both Chromium sandboxes, which containers cannot grant', async () => {
            await renderHtmlToPdf('<p>hello</p>');

            expect(lastLaunchOptions().args).toEqual(['--no-sandbox', '--disable-setuid-sandbox']);
        });
    });

    describe('the render', () => {
        it('writes the HTML into the page rather than navigating to a url', async () => {
            await renderHtmlToPdf('<h1>Invoice</h1>');

            expect(setContent).toHaveBeenCalledWith('<h1>Invoice</h1>', {
                waitUntil: 'load'
            });
        });

        it('turns JavaScript off, since the templates run none and the browser is unsandboxed', async () => {
            await renderHtmlToPdf('<p>hello</p>');

            expect(setJavaScriptEnabled).toHaveBeenCalledWith(false);
        });

        it('runs at most two browsers at once, however many renders are asked for', async () => {
            let open = 0;
            let peak = 0;
            launch.mockImplementation(() => {
                open += 1;
                peak = Math.max(peak, open);
                return new Promise((resolve) => {
                    setImmediate(() =>
                        resolve({
                            newPage,
                            close: jest.fn(() => {
                                open -= 1;
                                return Promise.resolve();
                            })
                        })
                    );
                });
            });

            await Promise.all(Array.from({ length: 5 }, () => renderHtmlToPdf('<p>x</p>')));
            launch.mockImplementation(() => Promise.resolve({ newPage, close }));

            expect(peak).toBe(2);
        });

        it('waits for the load event, so referenced assets are loaded before printing', async () => {
            await renderHtmlToPdf('<img src="https://cdn.example.com/logo.png" />');

            // `load` fires once images, stylesheets and subframes are done. Asserted rather than
            // left to the default, which is the same value — the point is that it is CHOSEN, and
            // that a future puppeteer changing its default cannot silently print blanks.
            expect(setContent.mock.calls.at(-1)?.[1]).toEqual({ waitUntil: 'load' });
        });

        it('defaults to A4 portrait', async () => {
            await renderHtmlToPdf('<p>hello</p>');

            expect(pdf).toHaveBeenCalledWith({ format: 'A4' });
        });

        it('passes a caller-supplied page geometry through instead', async () => {
            await renderHtmlToPdf('<p>hello</p>', { format: 'Letter', landscape: true });

            expect(pdf).toHaveBeenCalledWith({ format: 'Letter', landscape: true });
        });

        it('resolves with the bytes, so the caller decides whether to stream, attach or store', async () => {
            await expect(renderHtmlToPdf('<p>hello</p>')).resolves.toBe(pdfBuffer);
        });

        it('opens one isolated page per call, so concurrent renders cannot see each other', async () => {
            await Promise.all([renderHtmlToPdf('<p>one</p>'), renderHtmlToPdf('<p>two</p>')]);

            expect(launch).toHaveBeenCalledTimes(2);
            expect(newPage).toHaveBeenCalledTimes(2);
        });
    });

    describe('teardown', () => {
        it('closes the browser after a successful render', async () => {
            await renderHtmlToPdf('<p>hello</p>');

            expect(close).toHaveBeenCalledTimes(1);
        });

        it('closes the browser when the page fails to open', async () => {
            newPage.mockRejectedValueOnce(new Error('no tab'));

            await expect(renderHtmlToPdf('<p>hello</p>')).rejects.toThrow('no tab');
            expect(close).toHaveBeenCalledTimes(1);
        });

        it('closes the browser when the HTML fails to load', async () => {
            setContent.mockRejectedValueOnce(new Error('bad html'));

            await expect(renderHtmlToPdf('<p>hello</p>')).rejects.toThrow('bad html');
            expect(close).toHaveBeenCalledTimes(1);
        });

        it('closes the browser when printing fails', async () => {
            pdf.mockRejectedValueOnce(new Error('print failed'));

            await expect(renderHtmlToPdf('<p>hello</p>')).rejects.toThrow('print failed');
            // Without the `finally`, a repeatedly failing invoice leaks one Chromium per attempt
            expect(close).toHaveBeenCalledTimes(1);
        });

        it('reports the close failure when the render failed too', async () => {
            pdf.mockRejectedValueOnce(new Error('print failed'));
            close.mockRejectedValueOnce(new Error('close failed'));

            // `finally` rejecting replaces the original reason: a browser that will not close is
            // the more serious of the two, and the render error is already lost to the caller
            await expect(renderHtmlToPdf('<p>hello</p>')).rejects.toThrow('close failed');
        });
    });
});

/*
 * The shutdown half: an exiting process must not orphan a render it started. The render below is
 * held open by a print that has not answered yet — the state a seeding script is in when it calls
 * `process.exit` right after a fire-and-forget invoice.
 */
/**
 * A print that answers only when the case says so — the render stays in flight until then.
 *
 * @returns the pending print, and the function that lets it finish
 */
const heldPrint = () => {
    let resolvePrint: ((bytes: typeof pdfBuffer) => void) | undefined;
    const printed = new Promise<typeof pdfBuffer>((resolve) => {
        resolvePrint = resolve;
    });
    return { printed, release: () => resolvePrint?.(pdfBuffer) };
};

describe('settleRenders', () => {
    it('waits for a render already in flight, so its browser is closed before exit', async () => {
        const print = heldPrint();
        pdf.mockImplementationOnce(() => print.printed);
        close.mockClear();
        const render = renderHtmlToPdf('<p>slow</p>');

        const settled = settleRenders(5000);
        // Let the render reach its print, then finish it.
        await new Promise((resolve) => setImmediate(resolve));
        print.release();

        await settled;
        await expect(render).resolves.toBe(pdfBuffer);
        expect(close).toHaveBeenCalledTimes(1);
    });

    it('gives up on a render that never finishes, rather than holding shutdown hostage', async () => {
        pdf.mockImplementationOnce(() => new Promise<typeof pdfBuffer>(() => undefined));
        void renderHtmlToPdf('<p>hung</p>');

        const startedAt = Date.now();
        await settleRenders(50);

        expect(Date.now() - startedAt).toBeLessThan(2000);
    });

    it('resolves at once when nothing is rendering', async () => {
        await expect(settleRenders(5000)).resolves.toBeUndefined();
    });
});
