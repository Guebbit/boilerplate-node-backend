/**
 * `deliverWebhook`'s (`@modules/webhooks/transport/webhook-delivery`) own SSRF-adjacent behaviour
 * — the timeout budget, the redirect refusal, and the plain-HTTP exemption path — on top of the
 * generic guard `tests/fuzz/ssrf-guard.fuzz.test.ts` covers on its own. The guard's hostile-URL
 * table lives there rather than here because the guard is infrastructure, reached through this
 * module's delivery path but not owned by it — deleting `webhooks` must not delete the guard's
 * only tests.
 */

import { EventEmitter } from 'node:events';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { deliverWebhook } from '@modules/webhooks/transport/webhook-delivery';

// `resolve4`/`resolve6` are mocked so DNS resolution inside `deliverWebhook`'s own SSRF check is
// deterministic — this suite must never depend on what a real DNS server answers.
jest.mock('node:dns/promises', () => ({
    resolve4: jest.fn(),
    resolve6: jest.fn()
}));

// The redirect-chain case below drives `deliverWebhook` end to end EXCEPT the actual socket —
// `node:https` itself is mocked so a simulated 3xx never needs a real server to answer it.
jest.mock('node:https', () => ({ request: jest.fn() }));

// Only reached by the exempted-demo-host case below — `webhook-delivery.ts` picks this over
// `node:https` for a plain `http:` target, which the guard only ever lets through for one
// exact, caller-named hostname.
jest.mock('node:http', () => ({ request: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- mocked module, requiring the mock's own jest.fn()s to configure per-test resolved addresses
const dns = require('node:dns/promises') as {
    resolve4: jest.Mock;
    resolve6: jest.Mock;
};

/** `resolve4`/`resolve6` as `dns.promises` answers them: an array of addresses, or a rejection. */
const mockDns = (v4: string[] | Error, v6: string[] | Error = new Error('ENODATA')): void => {
    dns.resolve4.mockImplementation(() =>
        v4 instanceof Error ? Promise.reject(v4) : Promise.resolve(v4)
    );
    dns.resolve6.mockImplementation(() =>
        v6 instanceof Error ? Promise.reject(v6) : Promise.resolve(v6)
    );
};

beforeEach(() => {
    dns.resolve4.mockReset();
    dns.resolve6.mockReset();
});

describe('deliverWebhook — the total timeout covers DNS resolution too', () => {
    it('times out while still resolving, instead of granting the POST its own separate budget', async () => {
        // Never settles — a resolver that is slow enough to eat the whole attempt budget by itself.
        dns.resolve4.mockImplementation(() => new Promise(() => undefined));
        dns.resolve6.mockImplementation(() => new Promise(() => undefined));

        const result = await deliverWebhook({
            url: 'https://slow-dns.example.test/hook',
            secrets: ['whsec_test-secret'],
            eventId: 'evt_slow_dns_1',
            payload: { a: 1 },
            timeoutMs: 50
        });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/timed out/i);
        // The POST is never reached: resolution alone already spent the one shared budget.
        expect(httpsRequest).not.toHaveBeenCalled();
    });
});

describe('deliverWebhook — a redirect is a failed delivery, never followed', () => {
    it('does not chase a 3xx Location header to a second request', async () => {
        mockDns(['93.184.215.9']);

        // `httpsRequest` resolves to `jest.fn()` under the `jest.mock('node:https', …)` above —
        // typed as the real export so the mock still shows up under `node:https`'s own signature.
        const mockedRequest = httpsRequest as jest.Mock;
        mockedRequest.mockImplementation(
            (_options: unknown, callback: (response: unknown) => void) => {
                // `EventEmitter`, not `EventTarget`: this stands in for a real `node:http`
                // `IncomingMessage`/`ClientRequest`, and Node's own HTTP stack is EventEmitter-based —
                // an `EventTarget` double would not match what `webhook-delivery.ts` actually calls.
                // eslint-disable-next-line unicorn/prefer-event-target -- mocking Node's own EventEmitter-based HTTP API, not writing new code
                const response = new EventEmitter() as EventEmitter & {
                    statusCode: number;
                    resume: () => void;
                };
                response.statusCode = 302;
                response.resume = jest.fn();
                queueMicrotask(() => callback(response));

                // eslint-disable-next-line unicorn/prefer-event-target -- same reason as `response` above
                const outgoing = new EventEmitter() as EventEmitter & { end: () => void };
                outgoing.end = jest.fn();
                return outgoing;
            }
        );

        const result = await deliverWebhook({
            url: 'https://redirecting.example.test/hook',
            secrets: ['whsec_test-secret'],
            eventId: 'evt_redirect_1',
            payload: { a: 1 }
        });

        // One call — a `Location` header on a 302 is never read, let alone followed.
        expect(mockedRequest).toHaveBeenCalledTimes(1);
        expect(result.success).toBe(false);
        expect(result.statusCode).toBe(302);
        expect(result.error).toMatch(/redirect/i);
    });
});

describe('deliverWebhook — speaks plain HTTP only to an exempted http: target', () => {
    it('uses node:http, never node:https, once the guard exempts the target', async () => {
        const mockedHttpRequest = httpRequest as jest.Mock;
        const mockedHttpsRequest = httpsRequest as jest.Mock;
        mockedHttpRequest.mockImplementation(
            (_options: unknown, callback: (response: unknown) => void) => {
                // eslint-disable-next-line unicorn/prefer-event-target -- mocking Node's own EventEmitter-based HTTP API, not writing new code
                const response = new EventEmitter() as EventEmitter & {
                    statusCode: number;
                    resume: () => void;
                };
                response.statusCode = 200;
                response.resume = jest.fn();
                queueMicrotask(() => callback(response));

                // eslint-disable-next-line unicorn/prefer-event-target -- same reason as `response` above
                const outgoing = new EventEmitter() as EventEmitter & { end: () => void };
                outgoing.end = jest.fn();
                return outgoing;
            }
        );

        const result = await deliverWebhook({
            url: 'http://127.0.0.1:8080/hook',
            secrets: ['whsec_test-secret'],
            eventId: 'evt_demo_1',
            payload: { a: 1 },
            allowedInsecureHost: '127.0.0.1'
        });

        expect(mockedHttpRequest).toHaveBeenCalledTimes(1);
        expect(mockedHttpsRequest).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
    });
});
