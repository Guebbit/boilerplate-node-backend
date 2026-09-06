/**
 * The self-hosted provider, exercised the way a browser exercises it: fetch a challenge, solve it
 * with the library's own solver, hand the payload back. Also the two refusals that matter — a
 * solution spent twice, and a payload signed by nobody.
 */

import { solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { altchaProvider } from '@infrastructure/adapters/antibot-providers/altcha';

const ORIGINAL = { ...process.env };

beforeEach(() => {
    process.env.NODE_ANTIBOT_ALTCHA_SECRET = 'an-altcha-signing-secret-value';
    // A tiny cost keeps the solver honest but fast; production defaults to 100_000.
    process.env.NODE_ANTIBOT_ALTCHA_COST = '500';
});

afterEach(() => {
    process.env = { ...ORIGINAL };
});

/** What a widget sends back: base64 of the challenge it was given plus the solution it found. */
const solvedPayload = async () => {
    const challenge = await altchaProvider.issueChallenge!();
    const solution = await solveChallenge({ challenge, deriveKey });
    return btoa(JSON.stringify({ challenge, solution }));
};

describe('the altcha provider', () => {
    it('points the widget at this server rather than a vendor', () => {
        expect(altchaProvider.publicParameters()).toEqual({ challengeUrl: '/antibot/challenge' });
    });

    it('issues a signed challenge carrying the configured cost', async () => {
        const challenge = await altchaProvider.issueChallenge!();

        expect(challenge.signature).toEqual(expect.any(String));
        expect(challenge.parameters.cost).toBe(500);
        expect(challenge.parameters.algorithm).toBe('PBKDF2/SHA-256');
    });

    it('accepts a genuinely solved challenge', async () => {
        await expect(altchaProvider.verify(await solvedPayload())).resolves.toBe('human');
    });

    it('refuses the same solution a second time', async () => {
        const payload = await solvedPayload();

        await expect(altchaProvider.verify(payload)).resolves.toBe('human');
        await expect(altchaProvider.verify(payload)).resolves.toBe('refused');
    });

    it('refuses a payload this server never signed', async () => {
        const payload = await solvedPayload();
        process.env.NODE_ANTIBOT_ALTCHA_SECRET = 'a-completely-different-secret!';

        await expect(altchaProvider.verify(payload)).resolves.toBe('refused');
    });

    it('refuses rather than throwing when the secret is missing', async () => {
        delete process.env.NODE_ANTIBOT_ALTCHA_SECRET;

        await expect(altchaProvider.verify('anything')).resolves.toBe('refused');
    });
});
