import { resolveSafeOutboundTarget } from '@infrastructure/adapters/ssrf-guard';
import {
    clearSsrfExemptOrigins,
    registerSsrfExemptOrigin
} from '@infrastructure/adapters/ssrf-exemptions';
import { setEnvironment } from '@tests/environment';
import { isIP } from 'node:net';
import { resolve4, resolve6 } from 'node:dns/promises';

// Names are resolved through `resolve4`/`resolve6`; mocked so no case depends on a real resolver.
jest.mock('node:dns/promises', () => ({ resolve4: jest.fn(), resolve6: jest.fn() }));

/** The two mocked resolvers, typed so a case can script an answer or a rejection per family. */
const dns = { v4: jest.mocked(resolve4), v6: jest.mocked(resolve6) };

/**
 * Scripts what DNS answers for both record types; an `Error` becomes a rejection with that error.
 * @param v4 - the A answer
 * @param v6 - the AAAA answer; defaults to a rejection (`ENODATA`, as for a missing record type)
 */
const mockDns = (v4: string[] | Error, v6: string[] | Error = new Error('ENODATA')): void => {
    dns.v4.mockImplementation(() =>
        v4 instanceof Error ? Promise.reject(v4) : Promise.resolve(v4)
    );
    dns.v6.mockImplementation(() =>
        v6 instanceof Error ? Promise.reject(v6) : Promise.resolve(v6)
    );
};

/**
 * Unit table for the SSRF guard: address and port rules, the pin, the exemption and the abort
 * signal. Literal IPs never reach DNS; names go through the mocked resolver above. The
 * hostile-URL table lives in `tests/fuzz/ssrf-guard.fuzz.test.ts`.
 */

beforeEach(() => {
    dns.v4.mockReset();
    dns.v6.mockReset();
});

describe('resolveSafeOutboundTarget — the deprecated IPv4-compatible block ::/96', () => {
    it.each([
        ['loopback inside ::/96', 'https://[::7f00:1]/hook'],
        ['cloud metadata endpoint inside ::/96', 'https://[::a9fe:a9fe]/hook']
    ])('refuses %s', async (_label, url) => {
        await expect(resolveSafeOutboundTarget(url)).rejects.toMatchObject({
            reason: 'unsafe-address'
        });
    });
});

describe('resolveSafeOutboundTarget — the port rule', () => {
    afterEach(() => {
        clearSsrfExemptOrigins();
        setEnvironment({ NODE_OUTBOUND_ALLOWED_PORTS: undefined });
    });

    it.each(['https://8.8.8.8:22/x', 'https://8.8.8.8:6379/x', 'https://8.8.8.8:8443/x'])(
        'refuses %s with unsafe-port',
        async (url) => {
            await expect(resolveSafeOutboundTarget(url)).rejects.toMatchObject({
                reason: 'unsafe-port'
            });
        }
    );

    it.each(['https://8.8.8.8/x', 'https://8.8.8.8:443/x'])('allows %s', async (url) => {
        await expect(resolveSafeOutboundTarget(url)).resolves.toMatchObject({
            resolvedAddress: '8.8.8.8'
        });
    });

    it('allows a port the operator listed, and only that one', async () => {
        setEnvironment({ NODE_OUTBOUND_ALLOWED_PORTS: '8443, 9443' });

        await expect(resolveSafeOutboundTarget('https://8.8.8.8:8443/x')).resolves.toMatchObject({
            resolvedAddress: '8.8.8.8'
        });
        await expect(resolveSafeOutboundTarget('https://8.8.8.8:22/x')).rejects.toMatchObject({
            reason: 'unsafe-port'
        });
    });

    it('lets an exempt origin through on its own port only', async () => {
        registerSsrfExemptOrigin('https://127.0.0.1:3070');

        await expect(resolveSafeOutboundTarget('https://127.0.0.1:3070/x')).resolves.toMatchObject({
            resolvedAddress: '127.0.0.1'
        });
        await expect(resolveSafeOutboundTarget('https://127.0.0.1:3071/x')).rejects.toMatchObject({
            reason: 'unsafe-port'
        });
    });
});

describe('resolveSafeOutboundTarget — scheme and credentials, refused before any DNS', () => {
    it.each(['not a url', 'https://', 'https://host.test:bad/x'])(
        'refuses the unparseable %j as invalid-url',
        async (url) => {
            await expect(resolveSafeOutboundTarget(url)).rejects.toMatchObject({
                reason: 'invalid-url'
            });
        }
    );

    it('refuses a non-https scheme as insecure-scheme without asking DNS', async () => {
        await expect(resolveSafeOutboundTarget('http://8.8.8.8/x')).rejects.toMatchObject({
            reason: 'insecure-scheme'
        });
        expect(dns.v4).not.toHaveBeenCalled();
    });

    it.each([
        ['a username and password', 'https://user:secret@8.8.8.8/x'],
        ['a username only', 'https://user@8.8.8.8/x'],
        ['a password only', 'https://:secret@8.8.8.8/x']
    ])('refuses %s in the URL as credentials-in-url', async (_label, url) => {
        await expect(resolveSafeOutboundTarget(url)).rejects.toMatchObject({
            reason: 'credentials-in-url'
        });
    });

    it('refuses credentials even on an exempt origin', async () => {
        registerSsrfExemptOrigin('https://sink.test');

        await expect(resolveSafeOutboundTarget('https://user@sink.test/x')).rejects.toMatchObject({
            reason: 'credentials-in-url'
        });
        clearSsrfExemptOrigins();
    });
});

describe('resolveSafeOutboundTarget — embedding forms and IPv4-mapped literals', () => {
    it.each([
        ['6to4', 'https://[2002:5db8:d707::]/x'],
        ['NAT64', 'https://[64:ff9b::5db8:d707]/x'],
        ['Teredo', 'https://[2001:0:4136:e378:8000:63bf:a247:28f8]/x']
    ])('refuses a %s address even though the embedded IPv4 is public', async (_label, url) => {
        await expect(resolveSafeOutboundTarget(url)).rejects.toMatchObject({
            reason: 'unsafe-address'
        });
    });

    it('judges a public IPv4-mapped literal by the IPv4 inside and lets it through', async () => {
        await expect(
            resolveSafeOutboundTarget('https://[::ffff:93.184.215.7]/x')
        ).resolves.toMatchObject({ resolvedAddress: '::ffff:5db8:d707' });
    });

    it('pins a public IPv6 literal with family 6 and brackets stripped', async () => {
        const target = await resolveSafeOutboundTarget('https://[2606:4700::1111]/x');

        expect(target.hostname).toBe('2606:4700::1111');
        expect(target.resolvedAddress).toBe('2606:4700::1111');
        const callback = jest.fn();
        target.lookup('ignored.test', { all: false }, callback);
        expect(callback).toHaveBeenCalledWith(null, '2606:4700::1111', 6);
    });
});

describe('resolveSafeOutboundTarget — name resolution', () => {
    it('refuses when a private v6 answer sits beside a public v4 one', async () => {
        mockDns(['93.184.215.7'], ['fd00::1']);

        await expect(resolveSafeOutboundTarget('https://mixed.test/x')).rejects.toMatchObject({
            reason: 'unsafe-address'
        });
    });

    it('lets a missing family not hide the other: v4 ENODATA plus a public v6 resolves to the v6', async () => {
        mockDns(new Error('ENODATA'), ['2606:4700::1111']);

        await expect(resolveSafeOutboundTarget('https://v6only.test/x')).resolves.toMatchObject({
            resolvedAddress: '2606:4700::1111'
        });
    });

    it('answers every lookup shape with the one pinned address when several are public', async () => {
        mockDns(['93.184.215.7', '93.184.215.8'], ['2606:4700::1111']);

        const target = await resolveSafeOutboundTarget('https://many.test/x');

        expect(['93.184.215.7', '93.184.215.8', '2606:4700::1111']).toContain(
            target.resolvedAddress
        );
        const single = jest.fn();
        const all = jest.fn();
        target.lookup('other.test', {}, single);
        target.lookup('other.test', { all: true }, all);
        expect(single).toHaveBeenCalledWith(
            null,
            target.resolvedAddress,
            isIP(target.resolvedAddress)
        );
        expect(all).toHaveBeenCalledWith(null, [
            { address: target.resolvedAddress, family: isIP(target.resolvedAddress) }
        ]);
    });

    it('fails closed on a malformed DNS answer', async () => {
        mockDns(['not-an-ip']);

        await expect(resolveSafeOutboundTarget('https://garbled.test/x')).rejects.toMatchObject({
            reason: 'unsafe-address'
        });
    });
});

describe('resolveSafeOutboundTarget — the origin exemption', () => {
    afterEach(() => {
        clearSsrfExemptOrigins();
    });

    it('resolves and pins an exempt name to the private address DNS gave', async () => {
        registerSsrfExemptOrigin('https://sink.test');
        mockDns(['127.0.0.1']);

        const target = await resolveSafeOutboundTarget('https://sink.test/hook');

        expect(target.resolvedAddress).toBe('127.0.0.1');
        expect(dns.v4).toHaveBeenCalledTimes(1);
        const callback = jest.fn();
        target.lookup('sink.test', { all: false }, callback);
        expect(callback).toHaveBeenCalledWith(null, '127.0.0.1', 4);
    });

    it('still refuses an exempt name that does not resolve', async () => {
        registerSsrfExemptOrigin('https://sink.test');
        mockDns(new Error('ENOTFOUND'), new Error('ENOTFOUND'));

        await expect(resolveSafeOutboundTarget('https://sink.test/hook')).rejects.toMatchObject({
            reason: 'dns-resolution-failed'
        });
    });

    it.each([
        ['a subdomain', 'https://evil.sink.test/x'],
        ['a suffix', 'https://sink.test.evil.test/x'],
        ['a prefix', 'https://xsink.test/x'],
        ['a trailing-dot FQDN', 'https://sink.test./x']
    ])('does not exempt %s', async (_label, url) => {
        registerSsrfExemptOrigin('https://sink.test');
        mockDns(['127.0.0.1']);

        await expect(resolveSafeOutboundTarget(url)).rejects.toMatchObject({
            reason: 'unsafe-address'
        });
    });

    it('does not exempt a neighbouring literal', async () => {
        registerSsrfExemptOrigin('https://127.0.0.1');

        await expect(resolveSafeOutboundTarget('https://127.0.0.10/x')).rejects.toMatchObject({
            reason: 'unsafe-address'
        });
    });

    it('matches the exemption whatever the hostname case', async () => {
        registerSsrfExemptOrigin('https://sink.test');
        mockDns(['127.0.0.1']);

        await expect(resolveSafeOutboundTarget('https://SINK.Test/x')).resolves.toMatchObject({
            resolvedAddress: '127.0.0.1'
        });
    });

    it('exempts a bracketed IPv6 literal origin as URL writes it', async () => {
        registerSsrfExemptOrigin('https://[::1]');

        await expect(resolveSafeOutboundTarget('https://[::1]/x')).resolves.toMatchObject({
            resolvedAddress: '::1'
        });
    });
});

describe('resolveSafeOutboundTarget — the abort signal', () => {
    it('rejects promptly with the abort reason when the signal is already aborted', async () => {
        mockDns(['93.184.215.7']);
        const reason = new Error('budget spent');

        await expect(
            resolveSafeOutboundTarget('https://slow.test/x', AbortSignal.abort(reason))
        ).rejects.toBe(reason);
    });

    it('wraps a non-Error abort reason in an Error carrying its text', async () => {
        mockDns(['93.184.215.7']);

        await expect(
            resolveSafeOutboundTarget('https://slow.test/x', AbortSignal.abort('budget'))
        ).rejects.toEqual(expect.objectContaining({ message: 'budget' }));
    });

    it('rejects with the abort reason when the signal fires while DNS is still pending', async () => {
        dns.v4.mockImplementation(() => new Promise<string[]>(() => undefined));
        dns.v6.mockImplementation(() => new Promise<string[]>(() => undefined));
        const controller = new AbortController();
        const reason = new Error('budget spent');

        const pending = resolveSafeOutboundTarget('https://slow.test/x', controller.signal);
        // Abort only once the lookup is under way: aborting at once takes the already-aborted
        // branch and never reaches the listener this case is about.
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
        expect(dns.v4).toHaveBeenCalled();
        controller.abort(reason);

        await expect(pending).rejects.toBe(reason);
    });

    it('rejects with a name-and-message abort reason as it is, whichever realm minted it', async () => {
        mockDns(['93.184.215.7']);
        const reason = { name: 'TimeoutError', message: 'too slow' };

        await expect(
            resolveSafeOutboundTarget('https://slow.test/x', AbortSignal.abort(reason))
        ).rejects.toBe(reason);
    });

    it.each([
        ['a name-only object', { name: 'X' }],
        ['a message-only object', { message: 'm' }],
        ['a non-string name', { name: 1, message: 'm' }],
        ['a non-string message', { name: 'X', message: 2 }]
    ])('wraps %s abort reason in an Error', async (_label, reason) => {
        mockDns(['93.184.215.7']);

        await expect(
            resolveSafeOutboundTarget('https://slow.test/x', AbortSignal.abort(reason))
        ).rejects.toBeInstanceOf(Error);
    });

    it('wraps a null abort reason in an Error', async () => {
        mockDns(['93.184.215.7']);

        await expect(
            resolveSafeOutboundTarget('https://slow.test/x', AbortSignal.abort(null))
        ).rejects.toEqual(expect.objectContaining({ message: 'null' }));
    });

    it('changes nothing when the signal never fires', async () => {
        mockDns(['93.184.215.7']);

        await expect(
            resolveSafeOutboundTarget('https://slow.test/x', new AbortController().signal)
        ).resolves.toMatchObject({ resolvedAddress: '93.184.215.7' });
    });
});
