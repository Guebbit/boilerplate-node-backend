/**
 * @module
 * The cap on held live streams, through the real route: an account past its share is refused with
 * a 429 and a wait, and a stream that ends gives its slot back. Nothing else stops one account
 * from holding streams open, since the request limiter counts opens and never holds.
 */

import http, { type IncomingMessage } from 'node:http';
import { setupTestDb } from '@tests/setup-test-db';
import { api, listen } from '@tests/http';
import { setCookie } from '@tests/cookies';
import { setEnvironment } from '@tests/environment';
import { eventually } from '@tests/eventually';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { openStreamCount } from '@modules/notifications/services/stream';

setupTestDb();

/** The streams a test holds open, destroyed afterwards so the module-level count starts empty. */
let held: IncomingMessage[] = [];

/** The app on a real socket: the stream must stay open while the test reads it. */
let listening: Awaited<ReturnType<typeof listen>>;

beforeAll(async () => {
    listening = await listen();
});

afterAll(() => {
    listening.server.closeAllConnections();
    listening.server.close();
});

afterEach(async () => {
    for (const stream of held) stream.destroy();
    held = [];
    await eventually(() => openStreamCount() === 0);
});

/** The session cookie a real login sets: the only credential an `EventSource` can carry. */
const sessionCookie = async (username: string) => {
    const user = await createUser({ email: `${username}@example.com`, username }, 'customer');
    const login = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });
    return `__Host-session=${/^__Host-session=([^;]+)/.exec(setCookie(login, '__Host-session') ?? '')?.[1] ?? ''}`;
};

/** What a test reads off an open attempt: the status line and headers, nothing of the body. */
interface Opened {
    /** The HTTP status of the open attempt. */
    status: number;
    /** Its response headers. */
    headers: IncomingMessage['headers'];
}

/**
 * Open the stream and leave it open. The answer settles as soon as the headers arrive; the raw
 * response is kept for the test to end.
 */
const openStream = (cookie: string): Promise<Opened> =>
    new Promise((resolve, reject) => {
        http.get(
            { port: listening.port, path: '/notifications/stream', headers: { Cookie: cookie } },
            (response) => {
                held.push(response);
                resolve({ status: response.statusCode ?? 0, headers: response.headers });
            }
        ).on('error', reject);
    });

describe('GET /notifications/stream, held streams', () => {
    it('refuses the stream past the per-account cap with a wait, and frees a slot when one closes', async () => {
        setEnvironment({ NODE_SSE_MAX_STREAMS_PER_USER: '2' });
        const cookie = await sessionCookie('capped');

        const first = await openStream(cookie);
        await openStream(cookie);
        const refused = await openStream(cookie);

        expect(first.status).toBe(200);
        expect(refused.status).toBe(429);
        expect(Number(refused.headers['retry-after'])).toBeGreaterThanOrEqual(1);

        held[0].destroy();
        await eventually(() => openStreamCount() === 1);
        const reopened = await openStream(cookie);

        expect(reopened.status).toBe(200);
    });

    it('does not charge one account for another one streams', async () => {
        setEnvironment({ NODE_SSE_MAX_STREAMS_PER_USER: '1' });
        const [a, b] = [await sessionCookie('first'), await sessionCookie('second')];

        await openStream(a);
        const other = await openStream(b);

        expect(other.status).toBe(200);
    });

    it('answers 503 with a wait once the process ceiling is reached', async () => {
        setEnvironment({ NODE_SSE_MAX_STREAMS: '1' });
        const [a, b] = [await sessionCookie('one'), await sessionCookie('two')];

        await openStream(a);
        const refused = await openStream(b);

        expect(refused.status).toBe(503);
        expect(Number(refused.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    });
});
