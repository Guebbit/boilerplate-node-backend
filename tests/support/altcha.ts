/**
 * @module
 * The self-hosted human check, solved the way a browser widget solves it: ask for a challenge,
 * do the work, send the answer back in the header the guarded call reads.
 */
import { solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { GetAntibotChallenge200Response } from '@api/schemas.zod';
import { api } from './http';
import { bodyOf } from './body-of';
import { setEnvironment } from './environment';

/** The header a guarded call carries its solved challenge in. */
const CHALLENGE_HEADER = 'x-antibot-challenge-token';

/**
 * Turns the ALTCHA human check on for this case, at a cost a test can pay in milliseconds.
 *
 * Call it in `beforeEach`: environment overrides reset per case.
 */
export const useAltcha = (): void => {
    setEnvironment({
        NODE_ANTIBOT_PROVIDER: 'altcha',
        NODE_ANTIBOT_ALTCHA_SECRET: 'journey-altcha-signing-secret',
        NODE_ANTIBOT_ALTCHA_COST: '500'
    });
};

/**
 * One freshly solved challenge, as the header a guarded call sends. A solution is good for one
 * call, so each guarded call asks for its own.
 *
 * @returns the header name and its value
 */
export const solvedChallenge = async (): Promise<Record<string, string>> => {
    const challenge = bodyOf(
        await api().get('/antibot/challenge'),
        GetAntibotChallenge200Response
    ).data;
    // altcha-lib: finds the key the challenge asks for. https://github.com/altcha-org/altcha-lib
    const solution = await solveChallenge({ challenge, deriveKey });

    return { [CHALLENGE_HEADER]: btoa(JSON.stringify({ challenge, solution })) };
};
