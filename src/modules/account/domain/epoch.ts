/**
 * @module
 * The session epoch rule, in one place: a token, or a login's proof, is refused when it predates
 * the account's `tokensValidAfter`. Pure, so the resolver, the refresh path and the mint cannot
 * drift apart.
 */

/**
 * Whether a token minted at `authTime` predates the account's session epoch.
 *
 * `auth_time` (not `iat`): `iat` is reset by one `/refresh`, `auth_time` is copied forward from the
 * login, so only a re-login or a re-mint after the epoch moves can clear it. Both sides compare in
 * whole seconds, the claim's own resolution: a token stamped in the very second of the bump is
 * kept, which is what lets the caller's re-minted session survive its own bump.
 *
 * @param authTime - the token's `auth_time` claim, epoch seconds
 * @param tokensValidAfter - the account's epoch, absent when no event ever moved it
 */
export const predatesSessionEpoch = (
    authTime: number,
    tokensValidAfter: Date | undefined
): boolean =>
    tokensValidAfter !== undefined && authTime < Math.floor(tokensValidAfter.getTime() / 1000);

/**
 * Whether a login's proof was checked before the account's epoch moved — a password changed while
 * the old one was being verified. Milliseconds, not the claim's whole seconds: at the mint there is
 * no re-minted session of the caller's own to keep, so the same-second grace has nothing to protect.
 *
 * @param provedAt - when the proof's check began, epoch milliseconds
 * @param tokensValidAfter - the account's epoch, absent when no event ever moved it
 */
export const proofPredatesEpoch = (provedAt: number, tokensValidAfter: Date | undefined): boolean =>
    tokensValidAfter !== undefined && provedAt < tokensValidAfter.getTime();
