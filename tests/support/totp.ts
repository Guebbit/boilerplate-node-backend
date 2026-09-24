import { generate } from 'otplib';

/**
 * The code a real authenticator app would show for `secret`, at a given RFC 6238 time step
 * relative to now. No default: a code confirming a fresh enrollment wants step 0 ("now"), while
 * every code minted AFTER that confirm wants step 1 — that "now" step is already spent, and
 * replay protection would refuse reusing it. `epochTolerance` on the server side is symmetric
 * (past and future), so a code minted one step ahead still verifies immediately rather than
 * needing a real 30-second wait.
 *
 * @param secret - the enrolled TOTP secret
 * @param stepsFromNow - how many 30-second steps ahead of now to mint the code for
 */
export const codeFor = (secret: string, stepsFromNow: number): Promise<string> =>
    generate({ secret, epoch: Math.floor(Date.now() / 1000) + stepsFromNow * 30 });
