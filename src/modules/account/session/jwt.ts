/**
 * @module
 * JWT creation and verification. Secrets and TTLs come from `./config`, which owns the policy.
 * This was app-level middleware until the domains became modules — issuing and verifying this
 * application's tokens is what `account` IS, and it reaches `users` for the stored refresh
 * tokens, exactly the dependency the manifest already declares. See
 * docs/modules/account-sessions.md.
 */

import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { sign, verify, decode, TokenExpiredError } from 'jsonwebtoken';
import type { ResolveMissReason } from '@kernel/authentication';
import { logger } from '@infrastructure/adapters/logger';
import { hashToken } from '@infrastructure/security/hash-token';
import { userService } from '@modules/users';
import { sessionRepository } from '../repository';
import {
    getAccessTokenRing,
    getRefreshTokenRing,
    getExpiryTime,
    getExpiryTimeMilliseconds,
    getAccessExpiryTime,
    getRotationGraceMilliseconds,
    getReuseDetectionWindowMilliseconds
} from './config';
import type { RefreshTokenExpiryTime } from './config';
import { keyId, keyForId } from './key-ring';
import { predatesSessionEpoch } from './epoch';

/**
 * The claims this app puts in every access/refresh JWT. Wire names are OIDC's, so a future
 * external identity provider's tokens would satisfy the same guards unchanged.
 */
export interface TokenData {
    id: string;
    /**
     * Epoch seconds at which the user last actually proved themselves — stamped once, at login
     * (`createRefreshToken`), then COPIED FORWARD on every access-token mint and every rotation,
     * never re-stamped from the clock. Required: `keyForId` already refuses any token whose `kid`
     * names no current ring member, and every token this app has ever signed under a live ring
     * member carries this claim — there is no reachable token that carries a `kid` but not this.
     */
    auth_time: number;
    /**
     * How the `auth_time` proof was made — RFC 8176 values. `['pwd']` today; a second factor
     * would add `'otp'`. Copied forward exactly like `auth_time`, same reasoning.
     */
    amr: string[];
    /**
     * The "remember me" tier the user ticked at login. ABSENT means a browser-session login: no
     * persistent cookie, server TTL of the `short` tier. Copied forward like `auth_time` — on
     * every access-token mint and every rotation — because a rotation that dropped it would turn
     * the session cookie persistent again on the first refresh.
     */
    remember?: RefreshTokenExpiryTime;
}

/**
 * What a rotation hands the controller. `refreshMaxAgeMs` is the new refresh cookie's `maxAge`,
 * or `undefined` for a browser-session login, whose cookie must stay a session cookie.
 */
export interface RotatedSession {
    accessToken: string;
    refreshToken: string;
    refreshMaxAgeMs: number | undefined;
}

/**
 * The claims to carry forward from one token to the next: `auth_time`, `amr`, and `remember`
 * only when one was ticked (an `undefined` claim would otherwise sit in the payload).
 */
const carriedClaims = ({ id, auth_time: authTime, amr, remember }: TokenData): TokenData => ({
    id,
    auth_time: authTime,
    amr,
    ...(remember && { remember })
});

/**
 * The `typ` header each token kind is signed with (RFC 9068 for the access token, the same shape
 * for the refresh token). A verifier demands its own, so a refresh token presented as a bearer is
 * refused even when both rings share a secret.
 * https://www.rfc-editor.org/rfc/rfc8725#section-3.11
 */
const TOKEN_TYPE_HEADER = { access: 'at+jwt', refresh: 'rt+jwt' } as const;

/** Which kind of token a verifier accepts — a key of {@link TOKEN_TYPE_HEADER}. */
type TokenKind = keyof typeof TOKEN_TYPE_HEADER;

/**
 * A token was refused for a reason the caller can act on — the one rejection the resolver turns
 * into a `{ miss }` answer, where any other error stays a rejection (an outage, a bug).
 */
export class TokenRejection extends Error {
    /** @param reason - why the token was refused, as the kernel's resolver port names it */
    constructor(
        readonly reason: ResolveMissReason,
        message: string
    ) {
        super(message);
        this.name = 'TokenRejection';
    }
}

/**
 * Classify what jsonwebtoken refused a token for. Only a bad signature is `invalid_signature`;
 * every other structural failure reads as `malformed`.
 */
const reasonOf = (error: Error): ResolveMissReason => {
    if (error instanceof TokenExpiredError) return 'expired';
    return error.message === 'invalid signature' ? 'invalid_signature' : 'malformed';
};

/**
 * Verify a token against whichever ring member its `kid` header names, HS256 pinned throughout,
 * and its `typ` header pinned to `kind`.
 * A `kid` naming no current ring member — a key this deployment has already retired, or a token
 * that never carried one — rejects before jsonwebtoken ever sees it: that is exactly "log in
 * again", not a signature-mismatch error to report differently.
 *
 * @param token - signed JWT string
 * @param ring - the ordered signing ring, newest first
 * @param kind - which kind of token this verifier accepts
 * @returns decoded payload
 */
const verifyAgainstRing = (
    token: string,
    ring: readonly string[],
    kind: TokenKind
): Promise<TokenData & { exp: number }> =>
    new Promise((resolve, reject) => {
        // jsonwebtoken: `decode` reads the header without checking the signature, which is all a
        // `kid` lookup needs. It returns `null` for a string that isn't shaped like a JWT at all,
        // rather than throwing.
        const decoded = decode(token, { complete: true });
        const secret = keyForId(ring, decoded?.header.kid);
        if (secret === undefined) {
            // Not a JWT at all is `malformed`; a JWT naming no live ring member is a forged or retired key.
            reject(
                new TokenRejection(
                    decoded ? 'invalid_signature' : 'malformed',
                    'Unknown signing key'
                )
            );
            return;
        }
        // `algorithms: ['HS256']` pins the accepted algorithm: without it a token whose header
        // claims `alg: none` or an asymmetric algorithm can pass verification under some library
        // configurations (the classic JWT "algorithm confusion" attack). `complete: true` returns
        // the header beside the payload, so `typ` can be checked after the signature is.
        verify(token, secret, { algorithms: ['HS256'], complete: true }, (error, data) => {
            if (error) {
                reject(new TokenRejection(reasonOf(error), error.message));
                return;
            }
            if (data?.header.typ !== TOKEN_TYPE_HEADER[kind]) {
                reject(new TokenRejection('malformed', 'Wrong token type'));
                return;
            }
            resolve(data.payload as TokenData & { exp: number });
        });
    });

/**
 * Verify an access token (stateless JWT check only).
 *
 * @param token - signed JWT string
 * @returns decoded payload
 */
export const verifyAccessToken = (token: string): Promise<TokenData> =>
    verifyAgainstRing(token, getAccessTokenRing(), 'access');

/**
 * Verify a refresh token — JWT check + DB revocation lookup.
 * Rejects with 'Forbidden' if the token is not a LIVE session row of an account that may still
 * sign in: a rotated-away (superseded) one is refused here, though the rotation itself still reads it.
 *
 * @param token - refresh JWT string
 * @returns decoded payload
 */
export const verifyRefreshToken = (token: string): Promise<TokenData> =>
    verifyAgainstRing(token, getRefreshTokenRing(), 'refresh').then((data) =>
        sessionRepository.findByHash(hashToken(token)).then((row) => {
            // A rotated-away token still has its row (reuse detection and the two-tab grace need
            // that); as a credential for anything but the rotation itself it is dead. Reuse is
            // only ever DETECTED at the rotation (RFC 9700 §4.14.2), never here.
            if (row?.mode !== 'jwt' || row.supersededAt || row.expiresAt <= new Date())
                throw new TokenRejection('revoked', 'Forbidden');
            // Scoped: a deactivated or deleted account's refresh cookie stops on its very next use.
            return userService.findAuthenticatableById(String(row.userId)).then((user) => {
                if (!user || predatesSessionEpoch(data.auth_time, user.tokensValidAfter))
                    throw new TokenRejection('revoked', 'Forbidden');
                return data;
            });
        })
    );

/** Sign an access-token payload with the ring's current key, stamping `kid` so a verifier can find it again. */
const signAccessToken = (claims: TokenData): string => {
    const key = getAccessTokenRing()[0];
    return sign(claims, key, {
        expiresIn: getAccessExpiryTime(),
        algorithm: 'HS256',
        keyid: keyId(key),
        header: { alg: 'HS256', typ: TOKEN_TYPE_HEADER.access }
    });
};

/**
 * Sign a refresh-token payload with the ring's current key.
 *
 * `jwtid` is what makes two refresh tokens minted in the same second different — see
 * `createRefreshToken`'s note on why that matters.
 */
const signRefreshToken = (claims: TokenData, expiresInSeconds: number): string => {
    const key = getRefreshTokenRing()[0];
    return sign(claims, key, {
        expiresIn: expiresInSeconds,
        algorithm: 'HS256',
        keyid: keyId(key),
        header: { alg: 'HS256', typ: TOKEN_TYPE_HEADER.refresh },
        jwtid: randomUUID()
    });
};

/**
 * Stamp the account's `lastActiveAt` — the clock the inactivity reaper measures. Never rejects: a
 * lost stamp costs a stale reading, nothing more, and a valid session must not fail on it. The
 * once-a-day throttle lives in the users repository.
 * @param userId - the account a session was just minted or refreshed for
 */
const recordActivity = (userId: string): Promise<void> =>
    userService.touchLastActive(userId).catch((error: unknown) => {
        // Stryker disable next-line all
        logger.warn({ message: 'Could not stamp the account as active.', userId, error });
    });

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
 * Create a refresh token, sign it, and store its session row.
 *
 * This is the choke point of every login path: a FIRST session for an account with a second
 * factor armed is refused unless `amr` carries it, so a path that forgot to branch to the
 * challenge cannot hand out a session. See docs/modules/account-sessions.md#the-mint-guard.
 *
 * @param id - user ID
 * @param remember - the ticked "remember me" tier; absent for a browser-session login, whose token
 *   still lives for the `short` tier
 * @param amr - how `auth_time` was proved — `['pwd']` unless a 2FA login supplies `['pwd', 'otp']`
 * @param mint - `'first'` (the default) for a login or signup, `'remint'` for a re-mint that
 *   replaces a session the caller already holds
 * @returns the signed refresh token
 * @throws {SecondFactorRequiredError} for a first session on a 2FA account without the factor in `amr`
 */
export const createRefreshToken = (
    id: string,
    remember?: RefreshTokenExpiryTime,
    amr: string[] = ['pwd'],
    mint: SessionMint = 'first'
): Promise<string> =>
    userService.findAuthenticatableById(id).then((user) => {
        if (!user) throw new Error('User not found');
        if (mint === 'first' && user.twoFactorEnabledAt && !amr.includes(SECOND_FACTOR_AMR))
            throw new SecondFactorRequiredError(id);
        /*
         * Signed through `signRefreshToken`, whose `jwtid` is what makes two refresh tokens
         * minted in the same second different. The payload is `{ id }` plus JWT's own
         * `iat`/`exp`, both at one-second resolution — so signing twice within a second for
         * one user produced byte-identical tokens. Two devices signing in together then
         * shared one credential stored as two identical rows, and revoking either revoked
         * both: logging out a phone silently logged out the laptop signed in alongside it. A
         * random `jti` gives every token its own identity — the digest is looked up as
         * though it addressed one session, because it does; `verify` carries `jti` through
         * without checking it.
         */
        const token = signRefreshToken(
            {
                id,
                // Stamped HERE, at login, and nowhere else — see the TokenData doc above.
                auth_time: Math.floor(Date.now() / 1000),
                amr,
                ...(remember && { remember })
            },
            getExpiryTime(remember)
        );
        const now = new Date();
        return sessionRepository
            .insert({
                userId: new Types.ObjectId(id),
                // A first row starts a session family; a rotation's successor copies it.
                familyId: new Types.ObjectId(),
                mode: 'jwt',
                tokenHash: hashToken(token),
                startedAt: now,
                expiresAt: new Date(now.getTime() + getExpiryTimeMilliseconds(remember))
            })
            .then(() => recordActivity(id))
            .then(() => token);
    });

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
    verifyRefreshToken(refreshToken).then((claims) => signAccessToken(carriedClaims(claims)));

/**
 * A refresh token was presented that no live session holds — genuinely unknown, or superseded
 * outside the grace window. Carries the owning user's id so the caller can decide what to do about
 * it without a second lookup; this module has already revoked every session on the account by the
 * time it throws.
 */
export class TokenReuseError extends Error {
    /** @param userId - the account whose refresh tokens were all revoked. */
    constructor(public readonly userId: string) {
        super('Refresh token reuse detected');
        this.name = 'TokenReuseError';
    }
}

/**
 * Every session this account currently holds, gone, and every access token with them — the
 * reuse-detected response. The epoch moves FIRST: if the removal then fails, the tokens are
 * already dead.
 */
const revokeAllRefreshTokens = (userId: string): Promise<void> =>
    userService
        .bumpSessionEpoch(userId)
        .then(() => sessionRepository.removeAll(userId))
        .then(() => undefined);

/**
 * Sign and store the winning half of a rotation: a new refresh token carrying the SAME absolute
 * expiry as the one it replaces (`remainingMs`), plus a fresh access token. `lastUsedAt` is
 * stamped immediately rather than left absent, the way a brand-new login's token is: from the
 * account holder's side this is a continuation of the same session, not a new one, and
 * `GET /account/sessions` should read it that way.
 *
 * `claims` are the OLD token's (`auth_time`, `amr`, `remember`), copied forward — same rule as `createAccessToken`,
 * and for the same reason: rotation mints a new token, and stamping the clock is what minting
 * normally does, which is exactly the trap here.
 */
const reissueRotated = (
    claims: TokenData,
    oldToken: string,
    remainingMs: number
): Promise<RotatedSession> =>
    userService.findAuthenticatableById(claims.id).then((user) => {
        if (!user) throw new Error('User not found');
        // The epoch may have moved since the presented token was minted: a rotation must not
        // carry a revoked session forward.
        if (predatesSessionEpoch(claims.auth_time, user.tokensValidAfter))
            throw new Error('Forbidden');

        return sessionRepository.findByHash(hashToken(oldToken)).then((previous) => {
            if (!previous) throw new Error('Forbidden');

            const newRefreshToken = signRefreshToken(claims, Math.ceil(remainingMs / 1000));
            const now = new Date();
            return sessionRepository
                .insert({
                    userId: previous.userId,
                    // The successor continues the session: same family id, so the id the owner
                    // sees (and revokes by) does not change with the token, and the same
                    // sign-in time, so "signed in on" names the session and not the token.
                    familyId: previous.familyId,
                    startedAt: previous.startedAt,
                    mode: 'jwt',
                    tokenHash: hashToken(newRefreshToken),
                    lastUsedAt: now,
                    expiresAt: new Date(now.getTime() + remainingMs)
                })
                .then(() => recordActivity(user.id))
                .then(() => ({
                    accessToken: signAccessToken(claims),
                    refreshToken: newRefreshToken,
                    // Only a persistent login keeps a persistent cookie.
                    refreshMaxAgeMs: claims.remember ? remainingMs : undefined
                }));
        });
    });

/**
 * The losing side of a rotation race: `tokenSupersede` already gave the swap to someone else, so
 * work out what the presented token actually is — a benign two-tabs race, an ordinary dead
 * credential, or theft — and answer accordingly. Split out of `rotateRefreshToken` purely so that
 * function reads as one decision (won the race, or didn't); the revoke-then-throw at the bottom
 * stays sequential, unchanged, since the throw must never be a lie about the account's state.
 *
 * @param claims - the OLD token's claims (`id`, `auth_time`, `amr`, `remember`), copied forward on a reissue
 * @param oldToken - the refresh JWT the caller presented
 * @param remainingMs - the losing token's remaining lifetime, carried forward on a reissue
 * @throws {Error} when the token is genuinely absent, or {@link TokenReuseError} on detected reuse
 */
const resolveLostRotation = (
    claims: TokenData,
    oldToken: string,
    remainingMs: number
): Promise<RotatedSession> =>
    sessionRepository.findByHash(hashToken(oldToken)).then((row) => {
        // Genuinely absent — revoked by logout/password-change/deactivation while this
        // JWT's signature still verified, or already deleted by its TTL. An ordinary dead
        // credential, same as it always was: NOT reuse, and nothing to revoke that isn't
        // already gone. `verifyRefreshToken` answers this identically for the non-rotating
        // callers that still use it.
        if (!row) throw new Error('Forbidden');

        // Still live (no `supersededAt`) despite losing the claim: only reachable through
        // a race tighter than `supersede` itself allows for. Treat it as live — the
        // credential is exactly as valid as the caller believes it is.
        if (!row.supersededAt) return reissueRotated(claims, oldToken, remainingMs);

        const supersededMsAgo = Date.now() - row.supersededAt.getTime();
        if (supersededMsAgo <= getRotationGraceMilliseconds())
            // The benign race: someone else's rotation of this SAME token already won,
            // moments ago. Reissue rather than reject — see the module doc above.
            return reissueRotated(claims, oldToken, remainingMs);

        // Superseded well outside the grace window: THIS is the signal that distinguishes
        // reuse from an ordinary dead credential — a token this account rotated away, on
        // purpose, being replayed long after. Revoke first, so the throw below is never a
        // lie about what state the account is left in.
        return revokeAllRefreshTokens(claims.id).then(() => {
            throw new TokenReuseError(claims.id);
        });
    });

/**
 * Exchange a refresh token for a NEW refresh token and a fresh access token, ROTATING the
 * refresh token's value on every exchange — unlike `createAccessToken`, which re-signs off a
 * refresh token that stays valid indefinitely. The full mechanism (why rotation detects theft, the
 * concurrency handling for two requests racing the same token, and what counts as reuse versus an
 * ordinary dead credential) is documented in full at
 * docs/modules/account-sessions.md#refresh-rotation.
 *
 * @param oldToken - the refresh JWT the caller presented
 * @returns the new access/refresh tokens and the refresh cookie's new `maxAge` (`undefined` for a
 *   browser-session login)
 * @throws when the JWT itself doesn't verify, or {@link TokenReuseError} on detected reuse
 */
export const rotateRefreshToken = (oldToken: string): Promise<RotatedSession> =>
    // Signature/expiry/ring lookup only, no DB round trip yet — same as `verifyAccessToken`.
    verifyAgainstRing(oldToken, getRefreshTokenRing(), 'refresh').then(({ exp, ...oldClaims }) => {
        const claims = carriedClaims(oldClaims);
        // `exp` is seconds since epoch (the JWT convention); clamp to at least 1s so a token that
        // verified with almost no time left still signs rather than producing `expiresIn: 0`,
        // which `jsonwebtoken` treats as "no expiry" — the opposite of what's intended here.
        const remainingMs = Math.max(exp * 1000 - Date.now(), 1000);

        return sessionRepository
            .supersede(hashToken(oldToken), new Date(), getReuseDetectionWindowMilliseconds())
            .then((won) =>
                won
                    ? reissueRotated(claims, oldToken, remainingMs)
                    : resolveLostRotation(claims, oldToken, remainingMs)
            );
    });

/**
 * The "remember me" tier of the session behind a refresh cookie, so a flow that re-mints the
 * session (reauth, password change) can keep its persistence instead of resetting it.
 *
 * Signature and expiry only, no database read: a password change has already revoked the token
 * by the time it re-mints. Anything unreadable — no cookie, an expired or foreign token, a bearer
 * client — answers `undefined`, the conservative browser-session default, never an error.
 *
 * @param refreshToken - the refresh cookie's value, if the request carried one
 * @param userId - the authenticated caller; a token naming anyone else is ignored
 * @returns the tier that was ticked at login, or `undefined`
 */
export const rememberOfRefreshToken = (
    refreshToken: string | undefined,
    userId: string
): Promise<RefreshTokenExpiryTime | undefined> =>
    refreshToken
        ? verifyAgainstRing(refreshToken, getRefreshTokenRing(), 'refresh')
              .then((claims) => (claims.id === userId ? claims.remember : undefined))
              // An unreadable cookie is an answer ("no known persistence"), not a failure.
              .catch(() => undefined)
        : Promise.resolve(undefined);
