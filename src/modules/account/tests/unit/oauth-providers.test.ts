/**
 * @module
 * The OAuth provider registry (`oauth/providers/index.ts`) and the `fake` implementation it always
 * carries. Google/GitHub each get their own file for the token-exchange parsing; this one is about
 * "which providers show up at all", the same question `payments/providers/providers.test.ts`
 * answers for the single-active-provider registry.
 */

import { enabledProviders, resolveOAuthProvider } from '../../oauth/providers';
import { FAKE_OAUTH_CODE, fakeOAuthProvider } from '../../oauth/providers/fake';

/** Every env var a provider's "configured" check reads, restored after each test. */
const OAUTH_ENV_KEYS = [
    'NODE_OAUTH_GOOGLE_CLIENT_ID',
    'NODE_OAUTH_GOOGLE_CLIENT_SECRET',
    'NODE_OAUTH_GITHUB_CLIENT_ID',
    'NODE_OAUTH_GITHUB_CLIENT_SECRET',
    'NODE_DEMO'
] as const;

describe('the OAuth provider registry', () => {
    const originalEnvironment: Record<string, string | undefined> = {};

    beforeEach(() => {
        for (const key of OAUTH_ENV_KEYS) {
            originalEnvironment[key] = process.env[key];
            delete process.env[key];
        }
    });

    afterEach(() => {
        for (const key of OAUTH_ENV_KEYS) {
            if (originalEnvironment[key] === undefined) delete process.env[key];
            else process.env[key] = originalEnvironment[key];
        }
    });

    it('lists nothing when no credentials are set and the demo profile is off', () => {
        expect(enabledProviders()).toEqual([]);
        expect(resolveOAuthProvider('google')).toBeUndefined();
        expect(resolveOAuthProvider('github')).toBeUndefined();
        expect(resolveOAuthProvider('fake')).toBeUndefined();
    });

    it('lists google only once both its client id and secret are set', () => {
        process.env.NODE_OAUTH_GOOGLE_CLIENT_ID = 'client-id';
        expect(enabledProviders()).not.toContain('google');

        process.env.NODE_OAUTH_GOOGLE_CLIENT_SECRET = 'client-secret';
        expect(enabledProviders()).toContain('google');
        expect(resolveOAuthProvider('google')?.name).toBe('google');
    });

    it('lists github independently of google', () => {
        process.env.NODE_OAUTH_GITHUB_CLIENT_ID = 'client-id';
        process.env.NODE_OAUTH_GITHUB_CLIENT_SECRET = 'client-secret';

        expect(enabledProviders()).toEqual(['github']);
    });

    it('lists fake only under the demo profile, with no credentials of its own', () => {
        expect(enabledProviders()).not.toContain('fake');

        process.env.NODE_DEMO = 'true';
        expect(enabledProviders()).toContain('fake');
        expect(resolveOAuthProvider('fake')?.name).toBe('fake');
    });

    it('resolves an unrecognised name to undefined rather than throwing', () => {
        expect(resolveOAuthProvider('facebook')).toBeUndefined();
    });
});

describe('fakeOAuthProvider', () => {
    it('sends the browser straight to the callback, code and state carried along', () => {
        const url = fakeOAuthProvider.authorizeUrl('the-state', 'https://api.test/callback');

        expect(url).toBe(`https://api.test/callback?code=${FAKE_OAUTH_CODE}&state=the-state`);
    });

    it('resolves the fixed code to a deterministic, already-verified identity', async () => {
        const identity = await fakeOAuthProvider.exchangeCode(
            FAKE_OAUTH_CODE,
            'https://api.test/callback'
        );

        expect(identity.emailVerified).toBe(true);
        expect(identity.providerId).toBeTruthy();
        expect(identity.email).toBeTruthy();
    });

    it('refuses any other code — no network call ever makes one up', async () => {
        await expect(
            fakeOAuthProvider.exchangeCode('not-the-fixed-code', 'https://api.test/callback')
        ).rejects.toThrow();
    });
});
