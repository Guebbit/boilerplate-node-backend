/**
 * @module
 * The port's selection rules: `none` by default, a named implementation when one is configured,
 * and a throw rather than a silent fallback on a typo — the property that keeps a deployment's
 * mistake from quietly disabling the rung.
 */

import {
    isHumanChallengeEnabled,
    resolveHumanChallengeProvider
} from '@infrastructure/adapters/antibot-providers';

const ORIGINAL = process.env.NODE_ANTIBOT_PROVIDER;

afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.NODE_ANTIBOT_PROVIDER;
    else process.env.NODE_ANTIBOT_PROVIDER = ORIGINAL;
});

describe('resolveHumanChallengeProvider', () => {
    it('defaults to the no-op provider — the rung is off unless a deployment says otherwise', () => {
        delete process.env.NODE_ANTIBOT_PROVIDER;

        expect(resolveHumanChallengeProvider().name).toBe('none');
        expect(isHumanChallengeEnabled()).toBe(false);
    });

    it('selects the implementation the environment names', () => {
        process.env.NODE_ANTIBOT_PROVIDER = 'turnstile';

        expect(resolveHumanChallengeProvider().name).toBe('turnstile');
        expect(isHumanChallengeEnabled()).toBe(true);
    });

    it('throws on an unknown name instead of falling back to the no-op', () => {
        process.env.NODE_ANTIBOT_PROVIDER = 'recaptcha';

        expect(() => resolveHumanChallengeProvider()).toThrow('Unknown NODE_ANTIBOT_PROVIDER');
    });
});

describe('the `none` provider', () => {
    it('passes every caller and publishes nothing to render', async () => {
        delete process.env.NODE_ANTIBOT_PROVIDER;
        const provider = resolveHumanChallengeProvider();

        expect(provider.publicParameters()).toEqual({});
        await expect(provider.verify('anything')).resolves.toBe('human');
    });
});
