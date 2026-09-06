/**
 * @module
 * `infrastructure/adapters/antibot.ts` — the `NODE_ANTIBOT_EMAIL_POLICY` resolver and its three
 * postures. No memoisation to reset here (unlike the payment/analytics provider registries): the
 * policy is read fresh per call, so each test only has to restore the env vars it touched.
 *
 * `node:dns/promises` is mocked so the `mx` policy's tests are hermetic — a real lookup would
 * make this "unit" suite depend on network access and an outside registry's uptime.
 */

import { resolveMx } from 'node:dns/promises';
import { checkEmailPolicy } from '@infrastructure/adapters/antibot';

jest.mock('node:dns/promises', () => ({ resolveMx: jest.fn() }));

const mockedResolveMx = jest.mocked(resolveMx);

/** Sets an env var back to its original value, or deletes it if there wasn't one. */
const restoreEnv = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
};

describe('checkEmailPolicy', () => {
    const originalPolicy = process.env.NODE_ANTIBOT_EMAIL_POLICY;
    const originalDenylist = process.env.NODE_ANTIBOT_EMAIL_DENYLIST_EXTRA;
    const originalAllowlist = process.env.NODE_ANTIBOT_EMAIL_ALLOWLIST;

    beforeEach(() => {
        // Any un-configured call is a bug: only the `mx` tests below should ever reach this.
        mockedResolveMx.mockRejectedValue(new Error('resolveMx should not have been called'));
    });

    afterEach(() => {
        restoreEnv('NODE_ANTIBOT_EMAIL_POLICY', originalPolicy);
        restoreEnv('NODE_ANTIBOT_EMAIL_DENYLIST_EXTRA', originalDenylist);
        restoreEnv('NODE_ANTIBOT_EMAIL_ALLOWLIST', originalAllowlist);
        mockedResolveMx.mockReset();
    });

    // Required by the plan: every rung must be provably off by default.
    it('is off by default — a known disposable domain still passes', async () => {
        delete process.env.NODE_ANTIBOT_EMAIL_POLICY;

        await expect(checkEmailPolicy('someone@mailinator.com')).resolves.toBe('ok');
    });

    it('throws on an unrecognised policy name, rather than silently allowing everything', async () => {
        process.env.NODE_ANTIBOT_EMAIL_POLICY = 'strict';

        await expect(checkEmailPolicy('someone@example.com')).rejects.toThrow(
            /NODE_ANTIBOT_EMAIL_POLICY/
        );
    });

    describe('policy: disposable', () => {
        beforeEach(() => {
            process.env.NODE_ANTIBOT_EMAIL_POLICY = 'disposable';
        });

        it('refuses a domain on the shipped blocklist', async () => {
            await expect(checkEmailPolicy('someone@mailinator.com')).resolves.toBe('refused');
        });

        it('allows an ordinary domain', async () => {
            await expect(checkEmailPolicy('someone@example.com')).resolves.toBe('ok');
        });

        it('allows a blocklisted domain added to the allowlist override', async () => {
            process.env.NODE_ANTIBOT_EMAIL_ALLOWLIST = 'mailinator.com';

            await expect(checkEmailPolicy('someone@mailinator.com')).resolves.toBe('ok');
        });

        it('refuses a domain added via the extra-denylist override alone', async () => {
            process.env.NODE_ANTIBOT_EMAIL_DENYLIST_EXTRA = 'throwaway.example';

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
            process.env.NODE_ANTIBOT_EMAIL_POLICY = 'mx';
        });

        it('refuses a known disposable domain without ever consulting DNS', async () => {
            await expect(checkEmailPolicy('someone@mailinator.com')).resolves.toBe('refused');
        });

        it('refuses a domain whose lookup resolves no records', async () => {
            mockedResolveMx.mockResolvedValue([]);

            await expect(checkEmailPolicy('someone@example.com')).resolves.toBe('refused');
        });

        it('refuses a domain whose lookup fails outright (NXDOMAIN, timeout, ...)', async () => {
            mockedResolveMx.mockRejectedValue(new Error('ENOTFOUND'));

            await expect(checkEmailPolicy('someone@example.com')).resolves.toBe('refused');
        });

        it('allows a domain with a real MX record', async () => {
            mockedResolveMx.mockResolvedValue([{ exchange: 'mail.example.com', priority: 10 }]);

            await expect(checkEmailPolicy('someone@example.com')).resolves.toBe('ok');
        });
    });
});
