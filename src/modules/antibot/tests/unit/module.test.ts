/**
 * This module's own boot gate: antibot's checks belong on its own manifest, since the kernel and
 * `src/app/required-config.ts` must never name a specific module's provider. Three groups,
 * combined into one `customCheck`: the secrets a selected provider needs, the email-policy rung's
 * own selector, and `NODE_ANTIBOT_PROVIDER` itself — `resolveHumanChallengeProvider` already
 * throws a good message on an unknown name; this is what makes that throw happen at boot instead
 * of on the first guarded request.
 *
 * Every case sets `NODE_ENV` away from `test` first: the gate short-circuits under the test
 * environment, so a suite that left it alone would assert nothing at all.
 */
import { assertRequiredConfig } from '@kernel/required-config';
import { withoutEnvironmentInThisFile } from '@tests/environment';
import antibotModule from '../../module';

withoutEnvironmentInThisFile([
    'NODE_ENV',
    'NODE_ANTIBOT_PROVIDER',
    'NODE_ANTIBOT_ALTCHA_SECRET',
    'NODE_ANTIBOT_TURNSTILE_SITE_KEY',
    'NODE_ANTIBOT_TURNSTILE_SECRET',
    'NODE_ANTIBOT_EMAIL_POLICY'
]);

/** A deployment that satisfies every unconditional check, for a case to break one thing in. */
const configure = (): void => {
    process.env.NODE_ENV = 'development';
};

/** `assertRequiredConfig` wired against only this module — the whole point of this file. */
const assertAntibot = (): void => assertRequiredConfig([antibotModule]);

describe('the antibot provider group', () => {
    it('asks for nothing while the rung is off — the default', () => {
        configure();

        expect(assertAntibot).not.toThrow();
    });

    it('refuses a self-hosted provider selected without its signing secret', () => {
        configure();
        process.env.NODE_ANTIBOT_PROVIDER = 'altcha';
        delete process.env.NODE_ANTIBOT_ALTCHA_SECRET;

        expect(assertAntibot).toThrow(/NODE_ANTIBOT_ALTCHA_SECRET/);
    });

    it('refuses a vendor provider missing either half of its key pair', () => {
        configure();
        process.env.NODE_ANTIBOT_PROVIDER = 'turnstile';
        process.env.NODE_ANTIBOT_TURNSTILE_SITE_KEY = 'site-key';
        delete process.env.NODE_ANTIBOT_TURNSTILE_SECRET;

        expect(assertAntibot).toThrow(/NODE_ANTIBOT_TURNSTILE_SECRET/);
    });

    it('accepts a fully configured provider', () => {
        configure();
        process.env.NODE_ANTIBOT_PROVIDER = 'altcha';
        process.env.NODE_ANTIBOT_ALTCHA_SECRET = 'an-altcha-signing-secret-value';

        expect(assertAntibot).not.toThrow();
    });

    it('refuses an unrecognized NODE_ANTIBOT_PROVIDER — at boot, not the first guarded request', () => {
        configure();
        process.env.NODE_ANTIBOT_PROVIDER = 'not-a-provider';

        expect(assertAntibot).toThrow(/NODE_ANTIBOT_PROVIDER/);
    });
});

describe('the antibot email-policy group', () => {
    it('asks for nothing while the policy is off — the default', () => {
        configure();

        expect(assertAntibot).not.toThrow();
    });

    it.each(['disposable', 'mx'])('accepts a recognized policy (%s)', (policy) => {
        configure();
        process.env.NODE_ANTIBOT_EMAIL_POLICY = policy;

        expect(assertAntibot).not.toThrow();
    });

    it('refuses to boot on an unrecognized policy, rather than throwing at the first signup', () => {
        configure();
        process.env.NODE_ANTIBOT_EMAIL_POLICY = 'not-a-policy';

        expect(assertAntibot).toThrow(/NODE_ANTIBOT_EMAIL_POLICY/);
    });
});
