/**
 * @module
 * "No session without the second factor", enforced where a session is minted rather than only
 * where a login branches. Both session modes call {@link assertSecondFactor} from their `issue`,
 * so a login path added later that forgot to branch to the challenge still cannot hand out a
 * session. See docs/modules/account-sessions.md#the-mint-guard.
 */

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
 * Whether a session being minted is the account's first for this proof, or replaces one the caller
 * already holds. Only a first session is checked for a second factor: a re-mint continues a
 * session that passed it.
 */
export type SessionMint = 'first' | 'remint';

/** The `amr` value a completed second factor adds — see `postLoginTwoFactor`. */
const SECOND_FACTOR_AMR = 'otp';

/**
 * Refuse a first session for an account with a second factor armed unless `amr` carries it.
 *
 * @param user - the account being signed in
 * @param user.id - its id
 * @param user.twoFactorEnabledAt - set while a second factor is armed
 * @param amr - how the proof was made
 * @param mint - `'first'` is checked, `'remint'` is not
 * @throws {SecondFactorRequiredError} when the account is armed and the proof lacks `otp`
 */
export const assertSecondFactor = (
    user: { id: string; twoFactorEnabledAt?: Date },
    amr: readonly string[],
    mint: SessionMint
): void => {
    if (mint === 'first' && user.twoFactorEnabledAt && !amr.includes(SECOND_FACTOR_AMR))
        throw new SecondFactorRequiredError(user.id);
};
