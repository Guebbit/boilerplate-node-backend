/**
 * @module
 * The helpdesk drill's browser check: sign in to Zammad's own screen through the edge proxy, with a
 * real Chromium, and record every request the browser sends.
 *
 * Why: the edge proxy answers 403 to any `Authorization` header, because a token or basic-auth header
 * skips Zammad's two-factor sign-in. That rule is only safe if Zammad's staff screen never sends one.
 * This proves it on the real screen, not on a guess: the sign-in works, and no request carried it.
 *
 * Run by `docker/helpdesk-drill.sh`: `tsx scripts/testing/helpdesk-legacy-ui.ts <base url>`, with
 * `DRILL_USERNAME` and `DRILL_PASSWORD` in the environment and a Chromium named by `CHROMIUM_PATH`.
 * Exit 0 only when the sign-in succeeded and no recorded request had an `Authorization` header.
 * Docs: docs/operate/zammad.md#the-drill
 */
import { setTimeout } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';

/** How long to keep recording after the sign-in, for the data and websocket traffic that follows it. */
const SETTLE_MS = 6000;

/** One request the browser sent, reduced to what the check reads. */
interface RecordedRequest {
    /** The request URL. */
    url: string;
    /** Header names, lowercased. */
    headerNames: string[];
}

/**
 * The text of a required environment variable.
 *
 * @param name - the variable
 * @throws {Error} when it is unset or empty
 */
const requireEnvironment = (name: string): string => {
    const value = process.env[name];
    if (value === undefined || value === '') throw new Error(`${name} is not set`);
    return value;
};

/** Chrome DevTools Protocol event: a request is about to leave, with the headers the page set. */
interface RequestEvent {
    request: { url: string; headers: Record<string, string> };
}

/** Chrome DevTools Protocol event: a websocket handshake is about to leave (it has no URL of its own). */
interface HandshakeEvent {
    request: { headers: Record<string, string> };
}

/** Chrome DevTools Protocol event: the headers that really went on the wire, cookies and all. */
interface ExtraInfoEvent {
    headers: Record<string, string>;
}

/**
 * Signs in through the page and returns every request recorded on the way.
 *
 * @param base - the edge proxy's base URL
 * @param username - the seeded admin's login
 * @param password - its password
 * @param executablePath - the Chromium binary
 * @throws {Error} when the sign-in does not answer 201
 */
const signInAndRecord = async (
    base: string,
    username: string,
    password: string,
    executablePath: string
): Promise<RecordedRequest[]> => {
    // `--no-sandbox`: this runs in a throwaway drill, often as a container's root, where Chromium's own
    // sandbox cannot start. https://pptr.dev/api/puppeteer.launchoptions
    const browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    const recorded: RecordedRequest[] = [];
    try {
        const page = await browser.newPage();
        // The protocol's network events see every request, the websocket handshake and the headers
        // Chromium adds itself included: `page.on('request')` shows neither.
        // https://chromedevtools.github.io/devtools-protocol/tot/Network/
        const client = await page.createCDPSession();
        await client.send('Network.enable');
        client.on('Network.requestWillBeSent', (event: RequestEvent) => {
            recorded.push({
                url: event.request.url,
                headerNames: Object.keys(event.request.headers).map((name) => name.toLowerCase())
            });
        });
        client.on('Network.requestWillBeSentExtraInfo', (event: ExtraInfoEvent) => {
            recorded.push({
                url: '(headers on the wire)',
                headerNames: Object.keys(event.headers).map((name) => name.toLowerCase())
            });
        });
        client.on('Network.webSocketWillSendHandshakeRequest', (event: HandshakeEvent) => {
            recorded.push({
                url: 'websocket handshake',
                headerNames: Object.keys(event.request.headers).map((name) => name.toLowerCase())
            });
        });

        await page.goto(`${base}/#login`, { waitUntil: 'networkidle2', timeout: 120_000 });
        await page.waitForSelector('input[name="username"]', { timeout: 60_000 });
        await page.type('input[name="username"]', username);
        await page.type('input[name="password"]', password);

        const signIn = page.waitForResponse(
            (response) =>
                response.url().endsWith('/api/v1/signin') && response.request().method() === 'POST',
            { timeout: 60_000 }
        );
        await page.click('form button[type="submit"]');
        const signInResponse = await signIn;
        const status = signInResponse.status();
        if (status !== 201) throw new Error(`the sign-in answered ${String(status)}, not 201`);

        // The screen leaves the login route once it is signed in, then loads its data and opens its
        // websocket: give that traffic a few seconds so it is recorded too. Not `waitForNetworkIdle`: the
        // screen reconnects its websocket for as long as it is open, so the network is never idle.
        // A string, not a function: it runs in the browser, which this file's types do not describe.
        await page.waitForFunction("!location.hash.startsWith('#login')", { timeout: 60_000 });
        await setTimeout(SETTLE_MS);
    } finally {
        await browser.close();
    }
    return recorded;
};

/**
 * Entry point: signs in, then fails on any recorded `Authorization` header.
 *
 * @throws {Error} when a variable is missing, the sign-in fails, or a request carried the header
 */
const main = async (): Promise<void> => {
    const base = process.argv.at(2);
    if (base === undefined) throw new Error('usage: helpdesk-legacy-ui.ts <base url>');
    const recorded = await signInAndRecord(
        base,
        requireEnvironment('DRILL_USERNAME'),
        requireEnvironment('DRILL_PASSWORD'),
        requireEnvironment('CHROMIUM_PATH')
    );

    const api = recorded.filter((request) => request.url.includes('/api/v1/'));
    // A check that saw nothing proves nothing: the sign-in alone is an API request.
    if (api.length === 0) throw new Error('the browser sent no API request: nothing was checked');
    const offenders = recorded.filter((request) => request.headerNames.includes('authorization'));
    if (offenders.length > 0)
        throw new Error(
            `${String(offenders.length)} request(s) carried an Authorization header: ${offenders
                .map((request) => request.url)
                .join(', ')}`
        );
    console.log(
        `signed in; ${String(recorded.length)} requests recorded (${String(api.length)} to the API), none with Authorization`
    );
};

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
