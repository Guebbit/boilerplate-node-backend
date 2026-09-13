/**
 * The SSRF guard (`@infrastructure/adapters/ssrf-guard`) against a table of hostile webhook URLs —
 * the property `tests/fuzz` exists for, per `docs/modules/webhooks.md`'s SSRF section: private
 * ranges, loopback, link-local (the cloud metadata endpoint), IPv6-mapped IPv4, decimal/octal/hex
 * encoded IPv4 literals, DNS names resolving to private space, credentials in the URL, and — at
 * `webhook-delivery.ts`'s layer — that a redirect is never followed.
 *
 * Deterministic, not exploratory: every case here has one correct answer (refuse, or don't), so
 * this is a fixed table rather than a `fast-check` arbitrary — the hostile inputs worth having are
 * the well-known bypass techniques, not random byte soup.
 *
 * 6to4 and Teredo literals are in the table too: both embed an IPv4 address that
 * `embeddedIPv4()` never unwraps, so a 6to4 literal encoding the cloud metadata endpoint reads as
 * an ordinary global address to every other check — see `ssrf-guard.ts`'s module docblock.
 */

import { EventEmitter } from 'node:events';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { resolveSafeWebhookTarget, SsrfRefusedError } from '@infrastructure/adapters/ssrf-guard';
import { deliverWebhook } from '@infrastructure/adapters/webhook-delivery';

// `resolve4`/`resolve6` are mocked so "a DNS name resolving to private space" is deterministic —
// this suite must never depend on what a real DNS server answers.
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

describe('resolveSafeWebhookTarget — literal IP hostiles, refused with unsafe-address', () => {
    it.each([
        ['RFC 1918 private (10/8)', 'https://10.0.0.1/hook'],
        ['RFC 1918 private (172.16/12)', 'https://172.16.5.5/hook'],
        ['RFC 1918 private (192.168/16)', 'https://192.168.1.1/hook'],
        ['RFC 1122 loopback', 'https://127.0.0.1/hook'],
        ['RFC 1122 loopback, non-canonical', 'https://127.1.2.3/hook'],
        [
            'RFC 3927 link-local — the cloud metadata endpoint',
            'https://169.254.169.254/latest/meta-data/'
        ],
        ['RFC 6598 carrier-grade NAT', 'https://100.64.0.1/hook'],
        ['RFC 919 broadcast', 'https://255.255.255.255/hook'],
        ['unspecified', 'https://0.0.0.0/hook'],
        ['multicast', 'https://224.0.0.1/hook'],
        ['IPv6 loopback', 'https://[::1]/hook'],
        ['IPv6 unique-local (RFC 4193)', 'https://[fc00::1]/hook'],
        ['IPv6 link-local', 'https://[fe80::1]/hook'],
        ['IPv4-mapped IPv6 loopback — the classic bypass', 'https://[::ffff:127.0.0.1]/hook'],
        ['IPv4-mapped IPv6 private', 'https://[::ffff:10.0.0.1]/hook'],
        ['decimal-encoded IPv4 (127.0.0.1)', 'https://2130706433/hook'],
        ['octal-encoded IPv4 (127.0.0.1)', 'https://0177.0.0.1/hook'],
        ['hex-encoded IPv4 (127.0.0.1)', 'https://0x7f000001/hook'],
        ['NAT64 loopback (RFC 6052)', 'https://[64:ff9b::7f00:1]/hook'],
        ['6to4 loopback (RFC 3056)', 'https://[2002:7f00:0001::]/hook'],
        ['6to4 private (RFC 3056, 10/8)', 'https://[2002:0a00:0001::]/hook'],
        ['6to4-encoded cloud metadata endpoint', 'https://[2002:a9fe:a9fe::]/hook'],
        [
            'Teredo-encoded loopback (RFC 4380)',
            'https://[2001:0000:4136:e378:8000:63bf:3fff:fdd2]/hook'
        ]
    ])('%s: %s', async (_label, url) => {
        await expect(resolveSafeWebhookTarget(url)).rejects.toBeInstanceOf(SsrfRefusedError);
        await expect(resolveSafeWebhookTarget(url)).rejects.toMatchObject({
            reason: 'unsafe-address'
        });
    });
});

describe('resolveSafeWebhookTarget — scheme and credential hostiles, refused before any DNS query', () => {
    it('refuses plain http://', async () => {
        await expect(resolveSafeWebhookTarget('http://example.test/hook')).rejects.toMatchObject({
            reason: 'insecure-scheme'
        });
        expect(dns.resolve4).not.toHaveBeenCalled();
    });

    it('refuses credentials embedded in the URL', async () => {
        await expect(
            resolveSafeWebhookTarget('https://attacker:hunter2@example.test/hook')
        ).rejects.toMatchObject({ reason: 'credentials-in-url' });
        expect(dns.resolve4).not.toHaveBeenCalled();
    });

    it('refuses a string that is not a URL at all', async () => {
        await expect(resolveSafeWebhookTarget('not a url')).rejects.toMatchObject({
            reason: 'invalid-url'
        });
    });
});

describe('resolveSafeWebhookTarget — a hostname whose DNS answer is private space', () => {
    it('refuses when the ONLY resolved address is private', async () => {
        mockDns(['10.1.2.3']);

        await expect(
            resolveSafeWebhookTarget('https://internal.example.test/hook')
        ).rejects.toMatchObject({
            reason: 'unsafe-address'
        });
    });

    it('refuses when even ONE of several resolved addresses is private — fail closed', async () => {
        mockDns(['203.0.113.7', '10.1.2.3']);

        await expect(
            resolveSafeWebhookTarget('https://multi-answer.example.test/hook')
        ).rejects.toMatchObject({ reason: 'unsafe-address' });
    });

    it('refuses when the v4 answer is private even though the v6 one is not', async () => {
        mockDns(['10.1.2.3'], ['2001:db8::1']);

        await expect(
            resolveSafeWebhookTarget('https://mixed-family.example.test/hook')
        ).rejects.toMatchObject({ reason: 'unsafe-address' });
    });

    it('accepts a hostname resolving only to public addresses', async () => {
        mockDns(['203.0.113.7']);

        const target = await resolveSafeWebhookTarget('https://public.example.test/hook');
        expect(target.resolvedAddress).toBe('203.0.113.7');
    });

    it('refuses when neither record type resolves — dns-resolution-failed', async () => {
        mockDns(new Error('ENOTFOUND'), new Error('ENOTFOUND'));

        await expect(
            resolveSafeWebhookTarget('https://nowhere.example.test/hook')
        ).rejects.toMatchObject({ reason: 'dns-resolution-failed' });
    });
});

describe('resolveSafeWebhookTarget — a literal IP never triggers a DNS query', () => {
    it('accepts a public literal IPv4 address without calling resolve4/resolve6', async () => {
        const target = await resolveSafeWebhookTarget('https://203.0.113.7/hook');

        expect(target.resolvedAddress).toBe('203.0.113.7');
        expect(dns.resolve4).not.toHaveBeenCalled();
        expect(dns.resolve6).not.toHaveBeenCalled();
    });
});

describe('resolveSafeWebhookTarget — the pinned lookup it hands back', () => {
    it('always answers the SAME address it validated, never re-resolving', async () => {
        mockDns(['203.0.113.9']);
        const target = await resolveSafeWebhookTarget('https://pin-me.example.test/hook');

        const singleAnswer = await new Promise((resolve, reject) => {
            target.lookup('pin-me.example.test', { all: false }, (error, address, family) =>
                error ? reject(error) : resolve({ address, family })
            );
        });
        expect(singleAnswer).toEqual({ address: '203.0.113.9', family: 4 });

        // Called a second time (`{ all: true }`, the shape `https.request` uses when it wants
        // every candidate address) — still the one address that was actually checked.
        const allAnswer = await new Promise((resolve, reject) => {
            target.lookup('pin-me.example.test', { all: true }, (error, addresses) =>
                error ? reject(error) : resolve(addresses)
            );
        });
        expect(allAnswer).toEqual([{ address: '203.0.113.9', family: 4 }]);

        // The DNS mock was consulted exactly once, by `resolveSafeWebhookTarget` itself — the
        // pinned `lookup` above answered from the already-validated address, not a new query.
        expect(dns.resolve4).toHaveBeenCalledTimes(1);
    });
});

describe('deliverWebhook — a redirect is a failed delivery, never followed', () => {
    it('does not chase a 3xx Location header to a second request', async () => {
        mockDns(['203.0.113.9']);

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

/*
 * `exemptHostname` — `@modules/webhooks/config`'s development/test-only demo-sink exemption.
 * Literal IPs, not DNS names: `resolveAllAddresses` returns a literal straight back without
 * calling `resolve4`/`resolve6`, so these cases need no `mockDns`.
 */
describe('resolveSafeWebhookTarget — the exemptHostname parameter', () => {
    it('allows a private, http: address for the exact exempted hostname', async () => {
        const target = await resolveSafeWebhookTarget('http://127.0.0.1:8080/hook', '127.0.0.1');
        expect(target.resolvedAddress).toBe('127.0.0.1');
    });

    it('still refuses a hostname other than the one exempted', async () => {
        await expect(
            resolveSafeWebhookTarget('http://127.0.0.1/hook', 'webhook-tester')
        ).rejects.toMatchObject({ reason: 'insecure-scheme' });
    });

    it('still refuses credentials in the URL, even for the exempted hostname', async () => {
        await expect(
            resolveSafeWebhookTarget('http://user:pass@127.0.0.1/hook', '127.0.0.1')
        ).rejects.toMatchObject({ reason: 'credentials-in-url' });
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
