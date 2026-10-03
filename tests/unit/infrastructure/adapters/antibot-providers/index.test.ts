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
import { setEnvironment } from '@tests/environment';

/** Saved so the provider each case selects is restored for every other suite. */

describe('resolveHumanChallengeProvider', () => {
    it('defaults to the no-op provider — the rung is off unless a deployment says otherwise', () => {
        setEnvironment({ NODE_ANTIBOT_PROVIDER: undefined });

        expect(resolveHumanChallengeProvider().name).toBe('none');
        expect(isHumanChallengeEnabled()).toBe(false);
    });

    it('selects the implementation the environment names', () => {
        setEnvironment({ NODE_ANTIBOT_PROVIDER: 'turnstile' });

        expect(resolveHumanChallengeProvider().name).toBe('turnstile');
        expect(isHumanChallengeEnabled()).toBe(true);
    });

    it('throws on an unknown name instead of falling back to the no-op', () => {
        setEnvironment({ NODE_ANTIBOT_PROVIDER: 'recaptcha' });

        expect(() => resolveHumanChallengeProvider()).toThrow('Unknown NODE_ANTIBOT_PROVIDER');
    });
});

describe('the `none` provider', () => {
    it('passes every caller and publishes nothing to render', async () => {
        setEnvironment({ NODE_ANTIBOT_PROVIDER: undefined });
        const provider = resolveHumanChallengeProvider();

        expect(provider.publicParameters('/antibot/challenge')).toEqual({});
        await expect(provider.verify('anything')).resolves.toBe('ok');
    });
});
