/**
 * @module
 * The session epoch rule, in one place: a token is refused when it predates the account's
 * `tokensValidAfter`. Pure, so the resolver and the refresh path cannot drift apart.
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
