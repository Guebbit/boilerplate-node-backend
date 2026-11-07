/**
 * @module
 * `infrastructure/adapters/antibot.ts` — the `NODE_ANTIBOT_EMAIL_POLICY` resolver and its three
 * postures. No memoisation to reset here (unlike the payment/analytics provider registries): the
 * policy is read fresh per call, so each test only has to restore the env vars it touched.
 *
 * `node:dns/promises` is mocked so the `mx` policy's tests are hermetic — a real lookup would
 * make this "unit" suite depend on network access and an outside registry's uptime.
 */

import { checkEmailPolicy } from '@infrastructure/adapters/antibot';
import { setEnvironment } from '@tests/environment';

/** The DNS lookup rung 2's `mx` policy makes — mocked, so no case reaches a real resolver. */
const mockedResolveMx = jest.fn();

/** The A and AAAA lookups of the RFC 5321 fallback — mocked for the same reason. */
const mockedResolve4 = jest.fn();
const mockedResolve6 = jest.fn();

/*
 * The adapter builds its resolver at import, before this file's own `const`s exist — so the
 * options it was built with are kept inside the mock, and read back with `jest.requireMock`.
 */
jest.mock('node:dns/promises', () => {
    const resolverOptions: unknown[] = [];
    return {
        resolverOptions,
        Resolver: class {
            constructor(options: unknown) {
                resolverOptions.push(options);
            }

            resolveMx = (domain: string): unknown => mockedResolveMx(domain);

            resolve4 = (domain: string): unknown => mockedResolve4(domain);

            resolve6 = (domain: string): unknown => mockedResolve6(domain);
        }
    };
});

/** A DNS failure the way Node reports it: an Error carrying a `code`. */
const dnsError = (code: string): Error => Object.assign(new Error(code), { code });

describe('checkEmailPolicy', () => {
    beforeEach(() => {
        // Any un-configured call is a bug: only the `mx` tests below should ever reach this.
        mockedResolveMx.mockRejectedValue(new Error('resolveMx should not have been called'));
    });

    afterEach(() => {
        mockedResolve4.mockReset();
        mockedResolve6.mockReset();
        mockedResolveMx.mockReset();
    });

    // Every rung must be provably off by default.
    it('is off by default — a known disposable domain still passes', async () => {
        setEnvironment({ NODE_ANTIBOT_EMAIL_POLICY: undefined });

        await expect(checkEmailPolicy('someone@mailinator.com')).resolves.toBe('ok');
    });

    it('throws on an unrecognised policy name, rather than silently allowing everything', async () => {
        setEnvironment({ NODE_ANTIBOT_EMAIL_POLICY: 'strict' });

        await expect(checkEmailPolicy('someone@example.com')).rejects.toThrow(
            /NODE_ANTIBOT_EMAIL_POLICY/
        );
    });

    describe('policy: disposable', () => {
        beforeEach(() => {
            setEnvironment({ NODE_ANTIBOT_EMAIL_POLICY: 'disposable' });
        });

        it('refuses a domain on the shipped blocklist', async () => {
            await expect(checkEmailPolicy('someone@mailinator.com')).resolves.toBe('refused');
        });

        it('allows an ordinary domain', async () => {
            await expect(checkEmailPolicy('someone@example.com')).resolves.toBe('ok');
        });

        it('allows a blocklisted domain added to the allowlist override', async () => {
            setEnvironment({ NODE_ANTIBOT_EMAIL_ALLOWLIST: 'mailinator.com' });

            await expect(checkEmailPolicy('someone@mailinator.com')).resolves.toBe('ok');
        });

        it('refuses a domain added via the extra-denylist override alone', async () => {
            setEnvironment({ NODE_ANTIBOT_EMAIL_DENYLIST_EXTRA: 'throwaway.example' });

            await expect(checkEmailPolicy('someone@throwaway.example')).resolves.toBe('refused');
        });

        it('does not check MX records', async () => {
            // A domain with no MX record at all still passes under `disposable` — that check is
            // `mx`-only.
            await expect(
                checkEmailPolicy('someone@this-domain-does-not-exist.invalid')
            ).resolves.toBe('ok');
        });
    });

    describe('policy: mx', () => {
        beforeEach(() => {
            setEnvironment({ NODE_ANTIBOT_EMAIL_POLICY: 'mx' });
        });

        it('refuses a known disposable domain without ever consulting DNS', async () => {
            await expect(checkEmailPolicy('someone@mailinator.com')).resolves.toBe('refused');
        });

        it('refuses a domain that does not exist (NXDOMAIN)', async () => {
            mockedResolveMx.mockRejectedValue(dnsError('ENOTFOUND'));

            await expect(checkEmailPolicy('someone@example.com')).resolves.toBe('refused');
        });

        it('refuses a null MX (RFC 7505), even when the domain has an address', async () => {
            mockedResolveMx.mockResolvedValue([{ exchange: '', priority: 0 }]);
            mockedResolve4.mockResolvedValue(['192.0.2.1']);

            await expect(checkEmailPolicy('someone@example.com')).resolves.toBe('refused');
        });

        it('allows a domain with no MX but an A record', async () => {
            mockedResolveMx.mockRejectedValue(dnsError('ENODATA'));
            mockedResolve4.mockResolvedValue(['192.0.2.1']);
            mockedResolve6.mockRejectedValue(dnsError('ENODATA'));

            await expect(checkEmailPolicy('someone@example.com')).resolves.toBe('ok');
        });

        it('allows a domain with an empty MX answer but an AAAA record', async () => {
            mockedResolveMx.mockResolvedValue([]);
            mockedResolve4.mockRejectedValue(dnsError('ENODATA'));
            mockedResolve6.mockResolvedValue(['2001:db8::1']);

            await expect(checkEmailPolicy('someone@example.com')).resolves.toBe('ok');
        });

        it('refuses a domain with no MX and no address at all', async () => {
            mockedResolveMx.mockRejectedValue(dnsError('ENODATA'));
            mockedResolve4.mockRejectedValue(dnsError('ENODATA'));
            mockedResolve6.mockRejectedValue(dnsError('ENOTFOUND'));

            await expect(checkEmailPolicy('someone@example.com')).resolves.toBe('refused');
        });

        it('allows a domain when the MX lookup times out — unknown is not refusal', async () => {
            mockedResolveMx.mockRejectedValue(dnsError('ETIMEOUT'));

            await expect(checkEmailPolicy('someone@example.com')).resolves.toBe('ok');
        });

        it('allows a domain when the MX lookup answers SERVFAIL', async () => {
            mockedResolveMx.mockRejectedValue(dnsError('ESERVFAIL'));

            await expect(checkEmailPolicy('someone@example.com')).resolves.toBe('ok');
        });

        it('allows a domain when the fallback address lookup fails and finds nothing', async () => {
            mockedResolveMx.mockResolvedValue([]);
            mockedResolve4.mockRejectedValue(dnsError('ETIMEOUT'));
            mockedResolve6.mockRejectedValue(dnsError('ENODATA'));

            await expect(checkEmailPolicy('someone@example.com')).resolves.toBe('ok');
        });

        it('allows a domain with a real MX record', async () => {
            mockedResolveMx.mockResolvedValue([{ exchange: 'mail.example.com', priority: 10 }]);

            await expect(checkEmailPolicy('someone@example.com')).resolves.toBe('ok');
        });
    });
});

describe('the MX lookup', () => {
    it('is bounded to one try and two seconds, since it runs inside a signup request', () => {
        const { resolverOptions } = jest.requireMock<{ resolverOptions: unknown[] }>(
            'node:dns/promises'
        );

        expect(resolverOptions).toContainEqual({ timeout: 2000, tries: 1 });
    });
});
