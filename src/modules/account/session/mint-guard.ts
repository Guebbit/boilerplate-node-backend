/**
 * @module
 * What a first session must satisfy, enforced where it is minted rather than only where a login
 * branches. Both session modes call these from `issue`, never from a re-mint.
 *
 * - {@link assertSecondFactor}: no session without an armed second factor.
 * - {@link assertProofCurrent}: no session on a proof the account's epoch has since passed.
 *
 * See docs/modules/account-sessions.md#the-mint-guard.
 */

import { firstSessionRefused } from '../domain/session-proof';
import { proofPredatesEpoch } from './epoch';

/**
 * A first session was about to be minted for an account whose second factor is armed, on a proof
 * that carries none. No login path should reach the mint like this: each branches to the
 * challenge first, so this is the refusal that catches the path that forgot to.
 */
export class SecondFactorRequiredError extends Error {
    /** @param userId - the account a session was refused for. */
    constructor(public readonly userId: string) {
        super('A second factor is armed for this account and the proof carries none');
        this.name = 'SecondFactorRequiredError';
    }
}

/**
 * Refuse a first session for an account with a second factor armed unless `amr` carries it.
 *
 * @param user - the account being signed in
 * @param user.id - its id
 * @param user.twoFactorEnabledAt - set while a second factor is armed
 * @param amr - how the proof was made
 * @throws {SecondFactorRequiredError} when the account is armed and the proof lacks `otp`
 */
export const assertSecondFactor = (
    user: { id: string; twoFactorEnabledAt?: Date },
    amr: readonly string[]
): void => {
    if (firstSessionRefused(Boolean(user.twoFactorEnabledAt), amr))
        throw new SecondFactorRequiredError(user.id);
};

/**
 * A first session was about to be minted on a proof checked before the account's epoch moved: a
 * password change, a logout everywhere, landed while the login was in flight.
 */
export class StaleProofError extends Error {
    /** @param userId - the account a session was refused for. */
    constructor(public readonly userId: string) {
        super('The account ended its sessions after this proof was checked');
        this.name = 'StaleProofError';
    }
}

/**
 * Refuse a first session whose proof the account's epoch has passed. Read off the account the mint
 * has just loaded, so a password change committed between the check and the mint is seen.
 *
 * @param user - the account being signed in
 * @param user.id - its id
 * @param user.tokensValidAfter - its session epoch, absent when nothing ever moved it
 * @param provedAt - when the proof's check began, epoch milliseconds
 * @throws {StaleProofError} when the epoch moved after `provedAt`
 */
export const assertProofCurrent = (
    user: { id: string; tokensValidAfter?: Date },
    provedAt: number
): void => {
    if (proofPredatesEpoch(provedAt, user.tokensValidAfter)) throw new StaleProofError(user.id);
};
