/**
 * @module
 * What a session's `amr` says, as pure rules: the values this app mints, how proofs combine, and
 * when a first session must be refused for lack of one. No I/O, so every mint path shares it.
 *
 * See: docs/modules/account-sessions.md#the-mint-guard
 */

/**
 * The `amr` values (RFC 8176) a session can claim.
 *
 * - `password`: the account's password was checked.
 * - `otp`:      a second-factor code was verified.
 * - `email`:    a mailed step-up code was verified. This app's own value, not a registered one:
 *               `otp` means a second factor here, and a mailed code is not one.
 */
export const AMR = { password: 'pwd', otp: 'otp', email: 'email' } as const;

/**
 * Add proofs to the ones a session already carries.
 *
 * @param carried - the proofs so far
 * @param added - the proofs just made
 * @returns every proof once, in the order first seen
 */
export const withProofs = (carried: readonly string[], ...added: string[]): string[] => [
    ...new Set([...carried, ...added])
];

/**
 * Whether a FIRST session must be refused: a second factor is armed and the proof carries none.
 * A re-mint is never asked this: it continues a session that already passed.
 *
 * @param armed - whether the account has a second factor armed
 * @param amr - how the session's owner proved themselves
 */
export const firstSessionRefused = (armed: boolean, amr: readonly string[]): boolean =>
    armed && !amr.includes(AMR.otp);
