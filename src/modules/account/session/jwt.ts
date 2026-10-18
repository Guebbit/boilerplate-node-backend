/**
 * @module
 * JWT creation and verification, on `jose`. Secrets and TTLs come from `./config`, which owns the policy.
 * Issuing and verifying this application's tokens is what `account` IS, and it reaches `users`
 * for the stored refresh tokens, exactly the dependency the manifest already declares. See
 * docs/modules/account-sessions.md.
 */

import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import type { JWTHeaderParameters, JWTPayload } from 'jose';
import type { ResolveMissReason } from '@kernel/authentication';
import { hashToken } from '@infrastructure/security/hash-token';
import { userService } from '@modules/users';
import { sessionRepository } from '../repository';
import type { SessionRow } from '../repository';
import type { SessionSnapshot } from './strategy';
import {
    getAccessTokenRing,
    getRefreshTokenRing,
    getExpiryTime,
    getExpiryTimeMilliseconds,
    getAccessExpiryTime,
    getAccessTokenAudience,
    getRefreshTokenAudience,
    getTokenIssuer,
    getRotationGraceMilliseconds,
    getReuseDetectionWindowMilliseconds
} from './config';
import type { RefreshTokenExpiryTime } from './config';
import { keyId, keyForId } from './key-ring';
import { predatesSessionEpoch } from './epoch';
import { recordActivity } from './activity';
import { assertProofCurrent, assertSecondFactor } from './mint-guard';
import { revokeFor } from '../services/revocation';
import { resolveProof } from './auth-context';
import { resolveInLiveFamily } from './family-liveness';

/**
 * The claims this app puts in every access/refresh JWT, beyond the registered ones `signToken`
 * stamps (`iss`, `aud`, `iat`, `exp`, `jti`). Wire names are OIDC's, so a future external identity
 * provider's tokens would satisfy the same guards unchanged.
 */
export interface TokenData {
    /** The account the token speaks for — RFC 7519's `sub`. */
    sub: string;
    /**
     * Epoch seconds (RFC 7519 NumericDate) at which the user last actually proved themselves —
     * when the login's check BEGAN (`startSession`'s `provedAt`), then COPIED FORWARD on every
     * access-token mint and every rotation, never re-stamped from the clock. Required: `keyForId`
     * already refuses any token whose `kid` names no current ring member, and every token this app
     * has ever signed under a live ring member carries this claim — there is no reachable token
     * that carries a `kid` but not this.
     */
    auth_time: number;
    /**
     * How the `auth_time` proof was made — RFC 8176 values. `['pwd']` for a password login; a second
     * factor adds `'otp'`. Copied forward exactly like `auth_time`, same reasoning.
     */
    amr: string[];
    /**
     * The "remember me" tier the user ticked at login. ABSENT means a browser-session login: no
     * persistent cookie, server TTL of the `short` tier. Copied forward like `auth_time` — on
     * every access-token mint and every rotation — because a rotation that dropped it would turn
     * the session cookie persistent again on the first refresh.
     */
    remember?: RefreshTokenExpiryTime;
    /**
     * The session family an ACCESS token belongs to, so a revoked session stops its access tokens
     * at once instead of when they expire. Never on a refresh token, and never carried forward: each
     * access token is stamped from the row it was minted against.
     */
    sid?: string;
    /**
     * The client an ACCESS token was issued to, RFC 9068 §2.2: always {@link FIRST_PARTY_CLIENT_ID}.
     * Never on a refresh token, and never carried forward.
     */
    client_id?: string;
}

/** An access token's claims: {@link TokenData} with the session it belongs to. */
export type AccessTokenData = TokenData & { sid: string };

/**
 * The one client this app issues access tokens to: its own first-party frontend. RFC 9068 requires
 * the claim; there is no client registry to draw a second value from.
 */
export const FIRST_PARTY_CLIENT_ID = 'first-party';

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
const carriedClaims = ({ sub, auth_time: authTime, amr, remember }: TokenData): TokenData => ({
    sub,
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

/** Each kind's `aud`, read per call from config, so a token of one kind is refused as the other. */
const AUDIENCE_OF = {
    access: getAccessTokenAudience,
    refresh: getRefreshTokenAudience
} as const satisfies Record<TokenKind, () => string>;

/**
 * The registered claims a verifier demands present, per kind — `iss` and `aud` are demanded by
 * their own options. An access token carries RFC 9068 §2.2's full set; `client_id` is its alone.
 */
const REQUIRED_CLAIMS = {
    access: ['exp', 'iat', 'jti', 'sub', 'client_id'],
    refresh: ['exp', 'iat', 'jti', 'sub']
} as const satisfies Record<TokenKind, readonly string[]>;

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
 * Classify what jose refused a token for. A bad signature is `invalid_signature`, a lapsed `exp`
 * is `expired`, a `typ` of the wrong kind or any other structural failure is `malformed`. A
 * rejection the key lookup already raised passes through, and anything that is not a jose error
 * (an outage, a bug) stays a plain rejection.
 * https://github.com/panva/jose/blob/main/docs/jwt/verify/functions/jwtVerify.md
 *
 * @param error - what `jwtVerify` or the key lookup rejected with
 * @throws {TokenRejection} for every refusal the caller can act on
 */
const rejectionOf = (error: unknown): never => {
    if (error instanceof TokenRejection) throw error;
    if (error instanceof joseErrors.JWTExpired) throw new TokenRejection('expired', error.message);
    if (error instanceof joseErrors.JWSSignatureVerificationFailed)
        throw new TokenRejection('invalid_signature', error.message);
    if (error instanceof joseErrors.JWTClaimValidationFailed && error.claim === 'typ')
        throw new TokenRejection('malformed', 'Wrong token type');
    if (error instanceof joseErrors.JOSEError) throw new TokenRejection('malformed', error.message);
    throw error;
};

/**
 * Whether a verified payload carries the claims this app signs into every token. A signature
 * proves who wrote it, not its shape, so the shape is checked before anything reads it.
 *
 * @param payload - what jose verified, typed only as the open `JWTPayload`
 * @param kind - which kind of token it was verified as
 */
const carriesTokenClaims = (
    payload: JWTPayload,
    kind: TokenKind
): payload is JWTPayload & TokenData & { exp: number } =>
    typeof payload.sub === 'string' &&
    typeof payload.auth_time === 'number' &&
    Array.isArray(payload.amr) &&
    typeof payload.exp === 'number' &&
    // Only an access token names its session; a refresh token IS the session's credential.
    (kind !== 'access' || typeof payload.sid === 'string');

/**
 * The key lookup `jwtVerify` calls once it has parsed the header: the ring member the `kid` names.
 * A `kid` naming no current member (a retired key, a forged one, or none at all) is refused here,
 * which is "log in again", not a signature mismatch to report differently. A string that is not a
 * JWT never reaches this: jose has already refused it as malformed.
 *
 * @param ring - the ordered signing ring, newest first
 * @returns the lookup, resolving to the HMAC key bytes
 */
const ringKeyLookup =
    (ring: readonly string[]) =>
    ({ kid }: JWTHeaderParameters): Uint8Array => {
        const secret = keyForId(ring, kid);
        if (secret === undefined)
            throw new TokenRejection('invalid_signature', 'Unknown signing key');
        return new TextEncoder().encode(secret);
    };

/**
 * Verify a token against whichever ring member its `kid` header names, HS256 pinned, the `typ`
 * header, `iss` and `aud` pinned to `kind`, and every registered claim it must carry present.
 *
 * jose: `algorithms` is the allow-list that closes algorithm confusion (`none`, an asymmetric
 * algorithm under a symmetric key); `typ` is checked after the signature, as RFC 8725 §3.11 asks;
 * `issuer`/`audience` refuse a token another service minted, or one meant for the other kind
 * (RFC 8725 §3.10); `requiredClaims` refuses a token missing any of the rest.
 * https://github.com/panva/jose/blob/main/docs/jwt/verify/interfaces/JWTVerifyOptions.md
 *
 * @param token - signed JWT string
 * @param ring - the ordered signing ring, newest first
 * @param kind - which kind of token this verifier accepts
 * @returns decoded payload
 * @throws {TokenRejection} when the token is expired, forged, of the wrong kind or not a JWT
 */
const verifyAgainstRing = (
    token: string,
    ring: readonly string[],
    kind: TokenKind
): Promise<TokenData & { exp: number }> =>
    jwtVerify(token, ringKeyLookup(ring), {
        algorithms: ['HS256'],
        typ: TOKEN_TYPE_HEADER[kind],
        issuer: getTokenIssuer(),
        audience: AUDIENCE_OF[kind](),
        requiredClaims: [...REQUIRED_CLAIMS[kind]]
    }).then(({ payload }) => {
        if (!carriesTokenClaims(payload, kind))
            throw new TokenRejection('malformed', 'Wrong claims');
        return payload;
    }, rejectionOf);

/**
 * Verify an access token (stateless JWT check only).
 *
 * @param token - signed JWT string
 * @returns decoded payload
 */
export const verifyAccessToken = (token: string): Promise<AccessTokenData> =>
    verifyAgainstRing(token, getAccessTokenRing(), 'access').then((claims) => ({
        ...claims,
        // `carriesTokenClaims` required it for the access kind; the compiler cannot follow that.
        sid: claims.sid!
    }));

/**
 * Verify a refresh token — JWT check + DB revocation lookup.
 * Rejects with a `revoked` {@link TokenRejection} if the token is not a LIVE session row of an account that may still
 * sign in: a rotated-away (superseded) one is refused here, though the rotation itself still reads it.
 *
 * @param token - refresh JWT string
 * @returns decoded payload, and the live row it was checked against
 */
export const verifyRefreshWithRow = (
    token: string
): Promise<{ data: TokenData; row: SessionRow }> =>
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
                return { data, row };
            });
        })
    );

/**
 * Verify a refresh token (signature, a live row, an account that may still sign in).
 *
 * @param token - refresh JWT string
 * @returns decoded payload
 */
export const verifyRefreshToken = (token: string): Promise<TokenData> =>
    verifyRefreshWithRow(token).then(({ data }) => data);

/**
 * Sign a payload with a ring's current key, stamping `kid` so a verifier can find it again, and
 * the registered claims every token carries.
 *
 * jose: `SignJWT` builds and HMACs the compact token; `setExpirationTime` takes an absolute epoch
 * second (a bare number is never relative); `setJti` is the random id that makes two tokens
 * minted in the same second different.
 * https://github.com/panva/jose/blob/main/docs/jwt/sign/classes/SignJWT.md
 *
 * @param claims - the payload
 * @param ring - the signing ring, newest first; its first member signs
 * @param kind - which kind of token this is, which picks the `typ` header and the `aud`
 * @param lifetimeSeconds - how long the token lives
 */
const signToken = (
    claims: TokenData,
    ring: readonly string[],
    kind: TokenKind,
    lifetimeSeconds: number
): Promise<string> => {
    const [secret] = ring;
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ ...claims } satisfies JWTPayload)
        .setProtectedHeader({ alg: 'HS256', typ: TOKEN_TYPE_HEADER[kind], kid: keyId(secret) })
        .setIssuer(getTokenIssuer())
        .setAudience(AUDIENCE_OF[kind]())
        .setIssuedAt(now)
        .setExpirationTime(now + lifetimeSeconds)
        .setJti(randomUUID())
        .sign(new TextEncoder().encode(secret));
};

/** Sign an access-token payload with the access ring's current key, naming the client it is for. */
const signAccessToken = (claims: TokenData): Promise<string> =>
    signToken(
        { ...claims, client_id: FIRST_PARTY_CLIENT_ID },
        getAccessTokenRing(),
        'access',
        getAccessExpiryTime()
    );

/**
 * Sign a refresh-token payload with the refresh ring's current key.
 *
 * Its random `jti` (stamped by `signToken`) is what makes two refresh tokens minted in the same
 * second different — see `mintRefreshToken`'s note on why that matters.
 */
const signRefreshToken = (claims: TokenData, expiresInSeconds: number): Promise<string> =>
    signToken(claims, getRefreshTokenRing(), 'refresh', expiresInSeconds);

/**
 * Sign a refresh token for an account, and store its session row. The one place a refresh row is
 * written; {@link startSession} and {@link continueSession} differ only in the guard in front.
 *
 * @param id - user ID
 * @param proof - how `auth_time` was proved, and when (epoch milliseconds)
 * @param remember - the ticked "remember me" tier, absent for a browser-session login
 * @param guard - runs on the loaded account before anything is signed; throws to refuse
 * @param continued - the session being continued, when there is one: the successor joins its family
 *   and ends when it would have ended, so a re-proof cannot stretch a session's absolute life
 * @returns the signed refresh token
 */
const mintRefreshToken = (
    id: string,
    { amr, provedAt }: { amr: readonly string[]; provedAt: number },
    remember: RefreshTokenExpiryTime | undefined,
    guard: (user: { id: string; twoFactorEnabledAt?: Date; tokensValidAfter?: Date }) => void,
    continued?: SessionSnapshot
): Promise<string> =>
    userService.findAuthenticatableById(id).then((user) => {
        if (!user) throw new Error('User not found');
        guard(user);
        /*
         * Signed through `signRefreshToken`, whose `jti` is what makes two refresh tokens
         * minted in the same second different. The payload is `{ sub }` plus JWT's own
         * `iat`/`exp`, both at one-second resolution — so signing twice within a second for
         * one user produced byte-identical tokens. Two devices signing in together then
         * shared one credential stored as two identical rows, and revoking either revoked
         * both: logging out a phone silently logged out the laptop signed in alongside it. A
         * random `jti` gives every token its own identity — the digest is looked up as
         * though it addressed one session, because it does; verification requires `jti`
         * present and never compares it.
         */
        return signRefreshToken(
            {
                sub: id,
                // Stamped HERE, from the proof, and nowhere else — see the TokenData doc above.
                auth_time: Math.floor(provedAt / 1000),
                amr: [...amr],
                ...(remember && { remember })
            },
            continued?.expiresAt
                ? Math.max(Math.ceil((continued.expiresAt.getTime() - Date.now()) / 1000), 1)
                : getExpiryTime(remember)
        ).then((token) => {
            const now = new Date();
            return sessionRepository
                .insert({
                    userId: new Types.ObjectId(id),
                    // A first row starts a session family; a rotation's or a re-proof's
                    // successor copies it.
                    familyId: continued?.familyId ?? new Types.ObjectId(),
                    mode: 'jwt',
                    tokenHash: hashToken(token),
                    // Seconds, the claim's own unit: the session list judges a row by the epoch.
                    authTime: Math.floor(provedAt / 1000),
                    startedAt: continued?.startedAt ?? now,
                    expiresAt:
                        continued?.expiresAt ??
                        new Date(now.getTime() + getExpiryTimeMilliseconds(remember))
                })
                .then(() => recordActivity(id))
                .then(() => token);
        });
    });

/**
 * Start an account's FIRST session on this proof: a login or a signup.
 *
 * This is the choke point of every login path: an account with a second factor armed is refused
 * unless `amr` carries it, so a path that forgot to branch to the challenge cannot hand out a
 * session. See docs/modules/account-sessions.md#the-mint-guard.
 *
 * @param id - user ID
 * @param amr - how `auth_time` was proved, e.g. `[AMR.password]` or `[AMR.password, AMR.otp]`
 * @param remember - the ticked "remember me" tier; absent for a browser-session login, whose
 *   token still lives for the `short` tier
 * @param provedAt - when the proof's check began, epoch milliseconds; "now" for a caller that
 *   checked nothing before minting
 * @returns the signed refresh token
 * @throws {SecondFactorRequiredError} for a 2FA account whose `amr` lacks the second factor
 * @throws {StaleProofError} when the account's epoch moved after `provedAt`
 */
export const startSession = (
    id: string,
    amr: readonly string[],
    remember?: RefreshTokenExpiryTime,
    provedAt: number = Date.now()
): Promise<string> =>
    mintRefreshToken(id, { amr, provedAt }, remember, (user) => {
        assertSecondFactor(user, amr);
        assertProofCurrent(user, provedAt);
    });

/**
 * Continue a session the caller already holds under a new token: a re-authentication, a password
 * change, a factor change. Not guarded: the session being replaced already passed the factor.
 *
 * @param id - user ID
 * @param amr - the proofs the continued session claims; never defaulted
 * @param remember - the tier the replaced session had
 * @param continued - what the replaced session carried, read before the change that ended it
 * @returns the signed refresh token
 */
export const continueSession = (
    id: string,
    amr: readonly string[],
    remember?: RefreshTokenExpiryTime,
    continued?: SessionSnapshot
): Promise<string> =>
    // Stamped at the mint: a re-mint can follow its own epoch move (a password change), which a
    // proof time read before that move would predate.
    mintRefreshToken(id, { amr, provedAt: Date.now() }, remember, () => undefined, continued);

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
    verifyRefreshWithRow(refreshToken).then(({ data, row }) =>
        signAccessToken({ ...carriedClaims(data), sid: String(row.familyId) })
    );

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
 * Store a rotation's successor row and answer the new pair. The successor continues the session:
 * same family id, so the id the owner sees (and revokes by) does not change with the token, and
 * the same sign-in time, so "signed in on" names the session and not the token.
 *
 * @param previous - the row being rotated away
 * @param newRefreshToken - the signed successor
 * @param claims - the claims carried forward
 * @param remainingMs - what is left of the session's absolute lifetime
 */
const storeSuccessor = (
    previous: SessionRow,
    newRefreshToken: string,
    claims: TokenData,
    remainingMs: number
): Promise<RotatedSession> => {
    const now = new Date();
    return sessionRepository
        .insert({
            userId: previous.userId,
            familyId: previous.familyId,
            startedAt: previous.startedAt,
            mode: 'jwt',
            tokenHash: hashToken(newRefreshToken),
            authTime: claims.auth_time,
            // A refresh is the client renewing a token, not the person acting: the clock the idle
            // timeout reads is carried over, never reset by the rotation.
            ...(previous.lastUsedAt && { lastUsedAt: previous.lastUsedAt }),
            expiresAt: new Date(now.getTime() + remainingMs)
        })
        .then(() => recordActivity(claims.sub))
        .then(() => signAccessToken({ ...claims, sid: String(previous.familyId) }))
        .then((accessToken) => ({
            accessToken,
            refreshToken: newRefreshToken,
            // Only a persistent login keeps a persistent cookie.
            refreshMaxAgeMs: claims.remember ? remainingMs : undefined
        }));
};

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
    userService.findAuthenticatableById(claims.sub).then((user) => {
        if (!user) throw new TokenRejection('revoked', 'User not found');
        // The epoch may have moved since the presented token was minted: a rotation must not
        // carry a revoked session forward.
        if (predatesSessionEpoch(claims.auth_time, user.tokensValidAfter))
            throw new TokenRejection('revoked', 'Forbidden');

        return sessionRepository.findByHash(hashToken(oldToken)).then(async (previous) => {
            if (!previous) throw new TokenRejection('revoked', 'Forbidden');

            // A refresh is not the person acting (`passive`): judged against the idle limit, never
            // counted as activity. An idled-out staff family is removed by the check itself.
            const liveness = await resolveInLiveFamily(
                claims.sub,
                String(previous.familyId),
                'jwt',
                () => resolveProof(claims.sub, { authTime: claims.auth_time, amr: claims.amr }),
                { passive: true }
            );
            if ('miss' in liveness) throw new TokenRejection(liveness.miss, 'Session ended');

            return signRefreshToken(claims, Math.ceil(remainingMs / 1000)).then((newRefreshToken) =>
                storeSuccessor(previous, newRefreshToken, claims, remainingMs)
            );
        });
    });

/**
 * The losing side of a rotation race: the session row's `supersede` already gave the swap to someone else, so
 * work out what the presented token actually is — a benign two-tabs race, an ordinary dead
 * credential, or theft — and answer accordingly. Split out of `rotateRefreshToken` purely so that
 * function reads as one decision (won the race, or didn't); the revoke-then-throw at the bottom
 * stays sequential, unchanged, since the throw must never be a lie about the account's state.
 *
 * @param claims - the OLD token's claims (`sub`, `auth_time`, `amr`, `remember`), copied forward on a reissue
 * @param oldToken - the refresh JWT the caller presented
 * @param remainingMs - the losing token's remaining lifetime, carried forward on a reissue
 * @throws {TokenRejection} when the token is genuinely absent, or {@link TokenReuseError} on detected reuse
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
        if (!row) throw new TokenRejection('revoked', 'Forbidden');

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
        // lie about what state the account is left in: every session this account holds is gone,
        // and every access token with them — the epoch moves FIRST, so if the removal then fails
        // the tokens are already dead.
        return revokeFor('refresh-reuse', claims.sub).then(() => {
            throw new TokenReuseError(claims.sub);
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
        // verified with almost no time left still gets a successor that lives a moment.
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
              .then((claims) => (claims.sub === userId ? claims.remember : undefined))
              // An unreadable cookie is an answer ("no known persistence"), not a failure.
              .catch(() => undefined)
        : Promise.resolve(undefined);
