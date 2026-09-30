/**
 * @module
 * `scenarios/support/no-human-challenge.ts` — the scenario build runs with the human-challenge
 * provider off, and leaves the process exactly as it found it.
 *
 * Asserted against the real gate (`isHumanChallengeEnabled`), not the variable: what matters is
 * that the provider the app would answer with is `none` for the build and `altcha` again after.
 */
import { isHumanChallengeEnabled } from '@infrastructure/adapters/antibot-providers';
import { withoutHumanChallenge } from '@scenarios/support/no-human-challenge';

/** The two variables an altcha provider needs, saved so each case restores what was there. */
const KEYS = ['NODE_ANTIBOT_PROVIDER', 'NODE_ANTIBOT_ALTCHA_SECRET'] as const;
const ORIGINAL = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

/** Put `key` back to `value`, deleting it when it was unset. */
const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
};

beforeEach(() => {
    process.env.NODE_ANTIBOT_PROVIDER = 'altcha';
    process.env.NODE_ANTIBOT_ALTCHA_SECRET = 'a-test-altcha-signing-secret';
});

afterEach(() => {
    for (const key of KEYS) restore(key, ORIGINAL[key]);
});

describe('withoutHumanChallenge', () => {
    it('turns the gate off for the work, and back on after it', async () => {
        expect(isHumanChallengeEnabled()).toBe(true);

        const during = await withoutHumanChallenge(() =>
            Promise.resolve(isHumanChallengeEnabled())
        );

        expect(during).toBe(false);
        expect(isHumanChallengeEnabled()).toBe(true);
    });

    it('resolves to what the work resolved to', async () => {
        await expect(withoutHumanChallenge(() => Promise.resolve('built'))).resolves.toBe('built');
    });

    it('restores the provider when the work fails, and lets the failure through', async () => {
        await expect(
            withoutHumanChallenge(() => Promise.reject(new Error('the flows broke')))
        ).rejects.toThrow('the flows broke');

        expect(process.env.NODE_ANTIBOT_PROVIDER).toBe('altcha');
    });

    it('leaves an unset provider unset, not the string "undefined"', async () => {
        delete process.env.NODE_ANTIBOT_PROVIDER;

        await withoutHumanChallenge(() => Promise.resolve());

        expect('NODE_ANTIBOT_PROVIDER' in process.env).toBe(false);
    });
});
