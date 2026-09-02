/**
 * @module
 * JWT creation and verification. Secrets and TTLs come from `./config`, which owns the policy.
 * This was app-level middleware until the domains became modules — issuing and verifying this
 * application's tokens is what `account` IS, and it reaches `users` for the stored refresh
 * tokens, exactly the dependency the manifest already declares. See
 * docs/modules/account-sessions.md.
 */

import { randomUUID } from 'node:crypto';
import { sign, verify } from 'jsonwebtoken';
import { userRepository, TokenType, hashToken } from '@modules/users';
import type { CastError } from 'mongoose';
import {
    getAccessTokenSecret,
    getRefreshTokenSecret,
    getAccessTokenTTL,
    getExpiryTime,
    getExpiryTimeMilliseconds,
    getRotationGraceMilliseconds
} from './config';
import type { RefreshTokenExpiryTime } from './config';

/**
 * The claims this app puts in every access/refresh JWT. Wire names are OIDC's, so a future
 * external identity provider's tokens would satisfy the same guards unchanged.
 */
export interface TokenData {
    id: string;
    /**
     * Epoch seconds at which the user last actually proved themselves — stamped once, at login
     * (`createRefreshToken`), then COPIED FORWARD on every access-token mint and every rotation,
     * never re-stamped from the clock. Optional, honestly: a token signed before this claim
     * existed carries none at all. Every reader treats an absent value as `0` (infinitely old)
     * rather than trusting it, so a pre-existing session is asked to re-authenticate at its first
     * sensitive action instead of reading as freshly authenticated.
     */
    auth_time?: number;
    /**
     * How the `auth_time` proof was made — RFC 8176 values. `['pwd']` today; a second factor
     * would add `'otp'`. Copied forward exactly like `auth_time`, same optionality, same reason.
     */
    amr?: string[];
    /**
     * Present ONLY on an MFA challenge token (`createMfaChallenge`) — never on an access or
     * refresh token. `account/module.ts`'s `resolve()` rejects any token carrying this before it
     * ever reaches a guard: without that check, a challenge token signed with the same secret
     * would verify as a normal access token and skip the second factor entirely — the classic way
     * a step-up challenge like this gets built wrong.
     */
    purpose?: 'mfa';
}

/**
 * Verify an access token (stateless JWT check only).
 *
 * @param token - signed JWT string
 * @returns decoded payload
 */
export const verifyAccessToken = (token: string): Promise<TokenData> =>
    new Promise((resolve, reject) => {
        // jsonwebtoken: callback-style verify — signature and expiry only, no DB round trip.
        // `algorithms: ['HS256']` pins the accepted algorithm: without it a token whose header
        // claims `alg: none` or an asymmetric algorithm can pass verification under some library
        // configurations (the classic JWT "algorithm confusion" attack).
        verify(token, getAccessTokenSecret(), { algorithms: ['HS256'] }, (error, data) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(data as TokenData);
        });
    });

/**
 * Verify a refresh token — JWT check + DB revocation lookup.
 * Rejects with 'Forbidden' if the token is not in the user document.
 *
 * @param token - refresh JWT string
 * @returns decoded payload
 */
export const verifyRefreshToken = (token: string): Promise<TokenData> =>
    new Promise((resolve, reject) => {
        // `algorithms: ['HS256']` — same rationale as `verifyAccessToken` above.
        verify(token, getRefreshTokenSecret(), { algorithms: ['HS256'] }, (error, data) => {
            if (error) {
                reject(error);
                return;
            }
            userRepository
                .findByTokenValue(token)
                .then((user) => {
                    if (!user) {
                        reject(new Error('Forbidden'));
                        return;
                    }
                    resolve(data as TokenData);
                })
                .catch((error: Error | CastError) => reject(error));
        });
    });

/**
 * Create a refresh token, sign it, and persist it on the user document.
 *
 * @param id - user ID
 * @param remember - optional expiry tier
 * @param amr - how `auth_time` was proved — `['pwd']` unless a 2FA login supplies `['pwd', 'otp']`
 * @returns updated user document
 */
export const createRefreshToken = (
    id: string,
    remember?: RefreshTokenExpiryTime,
    amr: string[] = ['pwd']
) =>
    userRepository
        // Credentials included: minting a session pushes onto this document's `tokens`.
        .findByIdWithCredentials(id)
        .then((user) => {
            if (!user) throw new Error('User not found');
            /*
             * `jwtid` is what makes two refresh tokens minted in the same second different.
             * The payload is `{ id }` plus JWT's own `iat`/`exp`, both at one-second resolution —
             * so signing twice within a second for one user produced byte-identical tokens. Two
             * devices signing in together then shared one credential stored as two identical
             * rows, and revoking either revoked both: logging out a phone silently logged out the
             * laptop signed in alongside it. A random `jti` gives every token its own identity —
             * `tokens.token` is now queried as though it addressed one session, because it does;
             * `verify` carries `jti` through without checking it.
             */
            const token = sign(
                {
                    id,
                    // Stamped HERE, at login, and nowhere else — see the TokenData doc above.
                    auth_time: Math.floor(Date.now() / 1000),
                    amr
                } as TokenData,
                getRefreshTokenSecret(),
                {
                    expiresIn: getExpiryTime(remember),
                    algorithm: 'HS256',
                    jwtid: randomUUID()
                }
            );
            return user.tokenAdd(TokenType.REFRESH, getExpiryTimeMilliseconds(remember), token);
        });

/** How long an MFA login challenge lives — long enough to type a 6-digit code, no more. */
export const MFA_CHALLENGE_TTL_SECONDS = 300;

/**
 * Sign a step-up MFA challenge: `POST /account/login` issues this instead of a session when the
 * account has 2FA enabled, and `POST /account/login/2fa` is the only thing that accepts it back.
 *
 * Signed with the ACCESS secret, which is safe only because `purpose: 'mfa'` is checked at the
 * one place every access token is resolved (`account/module.ts`'s `resolve()`) — see `TokenData`.
 *
 * @param id - the user who passed the password check and still owes a second factor
 * @returns a short-lived, signed challenge token
 */
export const createMfaChallenge = (id: string): string =>
    sign({ id, purpose: 'mfa' } as TokenData, getAccessTokenSecret(), {
        expiresIn: MFA_CHALLENGE_TTL_SECONDS,
        algorithm: 'HS256'
    });

/**
 * Verify a challenge token from `createMfaChallenge`.
 *
 * @param token - the challenge string the caller submitted to `POST /account/login/2fa`
 * @returns the claims, if the signature verifies, is unexpired, and actually carries `purpose: 'mfa'`
 * @throws when any of those fail — a malformed, expired, or wrong-purpose token all read the same to the caller
 */
export const verifyMfaChallenge = (token: string): Promise<TokenData> =>
    verifyAccessToken(token).then((claims) => {
        if (claims.purpose !== 'mfa') throw new Error('Not an MFA challenge token');
        return claims;
    });

/**
 * Stamp a refresh token as used, so `GET /account/sessions` can show which device is idle.
 * Called from the REFRESH route only, never from `createAccessToken` (which login also uses to
 * mint a session's first access token) — stamping there would mark every session "just now" the
 * moment it's issued, distinguishing nothing.
 * Resolves even on failure: a valid refresh must not 401 because this bookkeeping write failed —
 * same reasoning `getRefreshToken` applies to `runTokenCleanup`.
 * @param refreshToken - the refresh JWT that was just exchanged
 */
export const recordRefreshTokenUse = (refreshToken: string): Promise<void> =>
    userRepository
        .tokenTouch(refreshToken)
        .then(() => undefined)
        .catch(() => undefined);

/**
 * Exchange a valid refresh token for a short-lived access token.
 *
 * `auth_time`/`amr` are COPIED from the refresh token's own claims, never read from the clock —
 * this is the single most likely way the step-up freshness gate breaks: get it wrong and
 * everything still works, every test but one still passes, and the freshness gate quietly stops
 * firing, because a client refreshing every ten minutes is never more than ten minutes from
 * "fresh". See `TokenData`'s doc.
 *
 * @param refreshToken - previously issued refresh JWT
 * @returns signed access JWT string
 */
export const createAccessToken = (refreshToken: string) =>
    verifyRefreshToken(refreshToken).then(({ id, auth_time: authTime, amr }) =>
        sign({ id, auth_time: authTime, amr } as TokenData, getAccessTokenSecret(), {
            // Seconds, not ms — this app's own TTL config, not a jsonwebtoken magic number.
            expiresIn: getAccessTokenTTL(),
            algorithm: 'HS256'
        })
    );

/**
 * A refresh token was presented that this document does not currently hold LIVE — genuinely
 * unknown, or superseded outside the grace window. Carries the
 * owning user's id so the caller can decide what to do about it without a second lookup; this
 * module has already revoked every refresh token on the account by the time it throws.
 */
export class TokenReuseError extends Error {
    constructor(public readonly userId: string) {
        super('Refresh token reuse detected');
        this.name = 'TokenReuseError';
    }
}

/** Every refresh token this account currently holds, gone — the reuse-detected response. */
const revokeAllRefreshTokens = (userId: string): Promise<void> =>
    userRepository
        .findByIdWithCredentials(userId)
        .then((user) => (user ? user.tokenRemoveAll(TokenType.REFRESH) : undefined));

/**
 * Sign and persist the winning half of a rotation: a new refresh token carrying the SAME absolute
 * expiry as the one it replaces (`remainingMs`), plus a fresh access token. `lastUsedAt` is
 * stamped immediately rather than left absent, the way a brand-new login's token is: from the
 * account holder's side this is a continuation of the same session, not a new one, and
 * `GET /account/sessions` should read it that way.
 *
 * `authTime`/`amr` are the OLD token's claims, copied forward — same rule as `createAccessToken`,
 * and for the same reason: rotation mints a new token, and stamping the clock is what minting
 * normally does, which is exactly the trap here.
 */
const reissueRotated = (
    id: string,
    remainingMs: number,
    authTime: number,
    amr: string[]
): Promise<{ accessToken: string; refreshToken: string; refreshMaxAgeMs: number }> =>
    userRepository.findByIdWithCredentials(id).then((user) => {
        if (!user) throw new Error('User not found');

        const claims = { id, auth_time: authTime, amr } as TokenData;
        const newRefreshToken = sign(claims, getRefreshTokenSecret(), {
            expiresIn: Math.ceil(remainingMs / 1000),
            algorithm: 'HS256',
            jwtid: randomUUID()
        });

        return user
            .tokenAdd(TokenType.REFRESH, remainingMs, newRefreshToken)
            .then((refreshToken) => recordRefreshTokenUse(refreshToken).then(() => refreshToken))
            .then((refreshToken) => ({
                accessToken: sign(claims, getAccessTokenSecret(), {
                    expiresIn: getAccessTokenTTL(),
                    algorithm: 'HS256'
                }),
                refreshToken,
                refreshMaxAgeMs: remainingMs
            }));
    });

/**
 * Exchange a refresh token for a NEW refresh token and a fresh access token, ROTATING the
 * refresh token's value. Unlike `createAccessToken`, which re-signs
 * an access token off a refresh token that stays valid indefinitely, this REPLACES it on every
 * exchange: a stolen cookie becomes detectable (a later presentation of the spent value) rather
 * than silently reusable for as long as it has left to live.
 *
 * The new token's absolute expiry is COPIED from the old one's `exp` claim, not reset to a fresh
 * full window — rotation changes the token's VALUE for theft detection, it does not extend how
 * long the session may live past what it was granted at login. See docs/modules/account-sessions.md.
 *
 * Concurrency: exactly one of two requests racing with the identical token WINS the atomic
 * `tokenSupersede` claim (see that method's doc) and rotates normally. The loser re-reads the
 * entry: if it was superseded moments ago (within `getRotationGraceMilliseconds()`), that is the
 * race, not theft, and the loser is reissued its own sibling token rather than rejected. A token
 * absent ENTIRELY is an ordinary dead credential (logout, password change, deactivation) and is
 * rejected same as ever — not reuse, and there is nothing to revoke that isn't already gone. Only
 * a token this account demonstrably rotated away, replayed well outside its grace window, is
 * treated as reuse — and that revokes the account's ENTIRE refresh set, not just the one token,
 * since the value itself is what leaked.
 *
 * @param oldToken - the refresh JWT the caller presented
 * @returns the new access/refresh tokens and the refresh cookie's new `maxAge`
 * @throws when the JWT itself doesn't verify, or {@link TokenReuseError} on detected reuse
 */
export const rotateRefreshToken = (
    oldToken: string
): Promise<{ accessToken: string; refreshToken: string; refreshMaxAgeMs: number }> =>
    new Promise<TokenData & { exp: number }>((resolve, reject) => {
        // Signature/expiry only, no DB round trip yet — same as `verifyAccessToken`.
        verify(oldToken, getRefreshTokenSecret(), { algorithms: ['HS256'] }, (error, data) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(data as TokenData & { exp: number });
        });
    }).then(({ id, exp, auth_time: rawAuthTime, amr }) => {
        // `exp` is seconds since epoch (the JWT convention); clamp to at least 1s so a token that
        // verified with almost no time left still signs rather than producing `expiresIn: 0`,
        // which `jsonwebtoken` treats as "no expiry" — the opposite of what's intended here.
        const remainingMs = Math.max(exp * 1000 - Date.now(), 1000);
        // Copied forward through rotation too, same rule `createAccessToken` follows. A
        // pre-wave-4 token with no `auth_time`/`amr` at all falls back the same way `resolve()`
        // does elsewhere — infinitely old, `pwd` as the only method it could possibly have used.
        const authTime = rawAuthTime ?? 0;
        const carriedAmr = amr ?? ['pwd'];

        return userRepository.tokenSupersede(oldToken).then((won) => {
            if (won) return reissueRotated(id, remainingMs, authTime, carriedAmr);

            return userRepository.findByTokenValue(oldToken).then((user) => {
                const digest = hashToken(oldToken);
                const entry = user?.tokens.find((tk) => tk.token === digest);

                // Genuinely absent — revoked by logout/password-change/deactivation while this
                // JWT's signature still verified, or already cleaned up. An ordinary dead
                // credential, same as it always was: NOT reuse, and nothing to revoke that isn't
                // already gone. `verifyRefreshToken` answers this identically for the non-rotating
                // callers that still use it.
                if (!entry) throw new Error('Forbidden');

                // Still live (no `supersededAt`) despite losing the claim: only reachable through
                // a race tighter than `tokenSupersede` itself allows for. Treat it as live — the
                // credential is exactly as valid as the caller believes it is.
                if (!entry.supersededAt)
                    return reissueRotated(id, remainingMs, authTime, carriedAmr);

                const supersededMsAgo = Date.now() - entry.supersededAt.getTime();
                if (supersededMsAgo <= getRotationGraceMilliseconds())
                    // The benign race: someone else's rotation of this SAME token already won,
                    // moments ago. Reissue rather than reject — see the module doc above.
                    return reissueRotated(id, remainingMs, authTime, carriedAmr);

                // Superseded well outside the grace window: THIS is the signal that distinguishes
                // reuse from an ordinary dead credential — a token this account rotated away, on
                // purpose, being replayed long after. Revoke first, so the throw below is never a
                // lie about what state the account is left in.
                return revokeAllRefreshTokens(id).then(() => {
                    throw new TokenReuseError(id);
                });
            });
        });
    });
