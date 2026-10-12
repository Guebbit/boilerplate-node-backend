/**
 * @module
 * `account/session/jwt.ts` — the token layer, at the unit level. Asserts the properties that keep
 * it SAFE: the two secrets never cross-verify, a refresh token is only valid while still stored,
 * ``jti: randomUUID()`` keeps two same-second logins from mutually revoking, and the signing ring
 * rotates without a mass logout. The session store and `@modules/users` are REPLACED rather than
 * driven: what the queries do is `../integration/auth-storage.test.ts`'s, against a real store.
 *
 * Every fixture below signs with `kid: keyId(secret)`, matching what `jwt.ts` itself stamps —
 * a fixture signed without one would verify against nothing, since `kid` is how a ring member is
 * found at all.
 */

import { SignJWT, decodeJwt, decodeProtectedHeader } from 'jose';
import { asStub } from '@tests/stub';
import { keyId } from '@modules/account/session/key-ring';

/*
 * The session store and the SERVICE, not the model: `session/jwt.ts` reaches `sessionRepository`
 * and `userService.findAuthenticatableById` rather than running raw queries itself, so this suite
 * doubles those instead. What the QUERIES look like is asserted in `../integration/auth-storage.test.ts`, against a
 * real store. Every other `userService` member rides through unchanged (`...actual.userService`).
 */
jest.mock('@modules/users', () => {
    const actual = jest.requireActual<typeof import('@modules/users')>('@modules/users');
    return {
        ...actual,
        __esModule: true,
        userService: {
            ...actual.userService,
            findAuthenticatableById: jest.fn(),
            touchLastActive: jest.fn()
        }
    };
});

jest.mock('@modules/account/repository', () => {
    const actual = jest.requireActual<typeof import('@modules/account/repository')>(
        '@modules/account/repository'
    );
    return {
        ...actual,
        __esModule: true,
        sessionRepository: {
            ...actual.sessionRepository,
            findByHash: jest.fn(),
            insert: jest.fn()
        }
    };
});

import {
    verifyAccessToken,
    verifyRefreshToken,
    createRefreshToken,
    createAccessToken
} from '@modules/account/session/jwt';
import { userService } from '@modules/users';
import { sessionRepository } from '@modules/account/repository';
import { hashToken } from '@infrastructure/security/hash-token';
import { setEnvironment } from '@tests/environment';

const USER_ID = '507f1f77bcf86cd799439011';

const mockedUsers = asStub<{
    findAuthenticatableById: jest.Mock;
    touchLastActive: jest.Mock;
}>(userService);

const mockedSessions = asStub<{
    findByHash: jest.Mock;
    insert: jest.Mock;
}>(sessionRepository);

/** A user that may sign in — the shape `findAuthenticatableById` answers, minus what jwt.ts never reads. */
const signedInUser = () => ({
    id: USER_ID,
    tokensValidAfter: undefined,
    twoFactorEnabledAt: undefined
});

/**
 * Makes the store answer a LIVE `jwt` row for whatever token is presented, owned by a user who
 * may still sign in — what `verifyRefreshToken` reads.
 */
const holdingLive = () => {
    mockedSessions.findByHash.mockImplementation((digest: string) =>
        Promise.resolve({
            userId: USER_ID,
            mode: 'jwt',
            tokenHash: digest,
            expiresAt: new Date(Date.now() + 3_600_000)
        })
    );
    mockedUsers.findAuthenticatableById.mockResolvedValue(signedInUser());
};

/** Lets `createRefreshToken` find its user and store its row. */
const mintable = () => {
    mockedUsers.findAuthenticatableById.mockResolvedValue(signedInUser());
    mockedUsers.touchLastActive.mockResolvedValue(undefined);
    mockedSessions.insert.mockResolvedValue(undefined);
};

/**
 * Sign a fixture the way `jwt.ts` itself signs — `kid` stamped from the secret. A fixture built
 * without a `kid` would carry no `kid` at all and never match a ring member.
 *
 * `auth_time`/`amr` default in, since `TokenData` requires both on every real token — `payload`
 * overrides either when a case is specifically about one of them.
 */
const signAs = (
    secret: string,
    payload: object,
    { expiresIn = 3600, typ }: { expiresIn?: number; typ?: string } = {}
): Promise<string> => {
    const now = Math.floor(Date.now() / 1000);
    return (
        new SignJWT({ auth_time: now, amr: ['pwd'], ...payload })
            // The `typ` a real token of that ring carries (RFC 9068); `typ` overrides it for the
            // cases that are about a wrong one.
            .setProtectedHeader({
                alg: 'HS256',
                typ: typ ?? (secret === 'refresh-secret' ? 'rt+jwt' : 'at+jwt'),
                kid: keyId(secret)
            })
            .setIssuedAt(now)
            .setExpirationTime(now + expiresIn)
            .sign(new TextEncoder().encode(secret))
    );
};

beforeEach(() => {
    // `reset`, not `clear`: these doubles are given a resolved or rejected value per test, and
    // `clearAllMocks` keeps the implementation while wiping only the call log — so a rejection
    // set in one case leaks into the next and fails it with the wrong error.
    jest.resetAllMocks();
    setEnvironment({ NODE_TOKEN_ACCESS: 'access-secret' });
    setEnvironment({ NODE_TOKEN_REFRESH: 'refresh-secret' });
    setEnvironment({ NODE_TOKEN_ACCESS_TIME: '900' });
    setEnvironment({ NODE_SESSION_TIME_SHORT: '3600' });
    setEnvironment({ NODE_SESSION_TIME_LONG: '2592000' });
});

describe('verifyAccessToken', () => {
    it('resolves the payload of a token signed with the access secret', async () => {
        const token = await signAs('access-secret', { id: USER_ID }, { expiresIn: 900 });

        await expect(verifyAccessToken(token)).resolves.toMatchObject({ id: USER_ID });
    });

    it('rejects a token signed with the REFRESH secret', async () => {
        // The separation that matters: a refresh token presented as a bearer token must not be
        // accepted, or the long-lived credential becomes the API credential.
        const refresh = await signAs('refresh-secret', { id: USER_ID }, { expiresIn: 3600 });

        await expect(verifyAccessToken(refresh)).rejects.toThrow();
    });

    it('rejects a token whose signature does not verify', async () => {
        // Claims the real ring member's `kid` but was actually signed with a different secret —
        // an attacker who can read the (public) kid format but not the secret itself.
        const forged = await new SignJWT({ id: USER_ID })
            .setProtectedHeader({ alg: 'HS256', kid: keyId('access-secret') })
            .setExpirationTime('10m')
            .sign(new TextEncoder().encode('wrong-secret'));

        await expect(verifyAccessToken(forged)).rejects.toThrow();
    });

    it('rejects an expired token', async () => {
        const expired = await signAs('access-secret', { id: USER_ID }, { expiresIn: -10 });

        await expect(verifyAccessToken(expired)).rejects.toThrow();
    });

    it('classifies each refusal for the resolver: expired, forged, retired key, not a JWT', async () => {
        const expired = await signAs('access-secret', { id: USER_ID }, { expiresIn: -10 });
        const forged = await new SignJWT({ id: USER_ID })
            .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt', kid: keyId('access-secret') })
            .setExpirationTime('10m')
            .sign(new TextEncoder().encode('wrong-secret'));
        const retired = await signAs('gone-secret', { id: USER_ID });

        await expect(verifyAccessToken(expired)).rejects.toMatchObject({ reason: 'expired' });
        await expect(verifyAccessToken(forged)).rejects.toMatchObject({
            reason: 'invalid_signature'
        });
        await expect(verifyAccessToken(retired)).rejects.toMatchObject({
            reason: 'invalid_signature',
            message: 'Unknown signing key'
        });
        await expect(verifyAccessToken('not-a-jwt')).rejects.toMatchObject({
            reason: 'malformed'
        });
    });

    it('refuses a correctly signed token that never expires', async () => {
        const forever = await new SignJWT({ id: USER_ID, auth_time: 1, amr: ['pwd'] })
            .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt', kid: keyId('access-secret') })
            .sign(new TextEncoder().encode('access-secret'));

        await expect(verifyAccessToken(forever)).rejects.toMatchObject({ reason: 'malformed' });
    });

    it('refuses a correctly signed token that lacks the claims this app signs', async () => {
        const bare = await new SignJWT({ id: USER_ID })
            .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt', kid: keyId('access-secret') })
            .setExpirationTime('10m')
            .sign(new TextEncoder().encode('access-secret'));

        await expect(verifyAccessToken(bare)).rejects.toMatchObject({
            reason: 'malformed',
            message: 'Wrong claims'
        });
    });

    it('rejects nonsense rather than resolving undefined', async () => {
        await expect(verifyAccessToken('not-a-jwt')).rejects.toThrow();
    });

    /**
     * `alg: none` and algorithm confusion, at the VERIFY side. `createRefreshToken`'s "pins HS256
     * rather than letting the header choose" test above only proves signing pins the algorithm;
     * it says nothing about what `verify` accepts. Built by hand rather than through
     * a signing library, none of which will produce `alg: none`.
     */
    it('rejects a hand-built alg:none token with no kid', async () => {
        const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
            'base64url'
        );
        const payload = Buffer.from(JSON.stringify({ id: USER_ID })).toString('base64url');
        // Empty signature segment — the trailing dot is `alg: none`'s whole point.
        const forged = `${header}.${payload}.`;

        await expect(verifyAccessToken(forged)).rejects.toThrow();
    });

    it('rejects the same forgery even naming a real kid', async () => {
        // `verifyAgainstRing` resolves a secret from `kid` BEFORE calling `verify` — a forgery
        // naming a real ring member gets further in than one that doesn't, so this is the case
        // that actually exercises the `algorithms: ['HS256']` pin rather than just the kid lookup.
        const header = Buffer.from(
            JSON.stringify({ alg: 'none', typ: 'JWT', kid: keyId('access-secret') })
        ).toString('base64url');
        const payload = Buffer.from(JSON.stringify({ id: USER_ID })).toString('base64url');
        const forged = `${header}.${payload}.`;

        await expect(verifyAccessToken(forged)).rejects.toThrow();
    });
});

describe('verifyRefreshToken', () => {
    it('resolves when the signature verifies AND the token is still stored', async () => {
        const token = await signAs('refresh-secret', { id: USER_ID }, { expiresIn: 3600 });
        holdingLive();

        await expect(verifyRefreshToken(token)).resolves.toMatchObject({ id: USER_ID });
        // Looked up BY THE TOKEN's digest, not by the id in its payload: the stored rows are the
        // authority on which sessions are live, and a payload cannot be asked whether it was revoked.
        expect(mockedSessions.findByHash).toHaveBeenCalledWith(hashToken(token));
    });

    it('rejects a validly signed token that is no longer stored', async () => {
        // Revocation. Without this branch, logout and session revocation are cosmetic: the JWT
        // still verifies until it expires, whatever the database says.
        const token = await signAs('refresh-secret', { id: USER_ID }, { expiresIn: 3600 });
        mockedSessions.findByHash.mockResolvedValue(null);

        await expect(verifyRefreshToken(token)).rejects.toThrow('Forbidden');
    });

    it('rejects a stored row that was rotated away, an expired one, and one of the other mode', async () => {
        const token = await signAs('refresh-secret', { id: USER_ID }, { expiresIn: 3600 });
        const live = { userId: USER_ID, mode: 'jwt', expiresAt: new Date(Date.now() + 60_000) };
        mockedUsers.findAuthenticatableById.mockResolvedValue(signedInUser());

        for (const dead of [
            { ...live, supersededAt: new Date() },
            { ...live, expiresAt: new Date(Date.now() - 1) },
            { ...live, mode: 'cookie' }
        ]) {
            mockedSessions.findByHash.mockResolvedValueOnce(dead);
            await expect(verifyRefreshToken(token)).rejects.toThrow('Forbidden');
        }
    });

    it('rejects a live row whose account may no longer sign in', async () => {
        const token = await signAs('refresh-secret', { id: USER_ID }, { expiresIn: 3600 });
        holdingLive();
        mockedUsers.findAuthenticatableById.mockResolvedValue(null);

        await expect(verifyRefreshToken(token)).rejects.toThrow('Forbidden');
    });

    it('rejects a token signed with the ACCESS secret', async () => {
        const access = await signAs('access-secret', { id: USER_ID }, { expiresIn: 900 });

        await expect(verifyRefreshToken(access)).rejects.toThrow();
    });

    it('does not reach the database when the signature already fails', async () => {
        // A forged token must cost nothing: checking the signature first is what stops an
        // unauthenticated flood from becoming a database query per request.
        await expect(verifyRefreshToken('not-a-jwt')).rejects.toThrow();
        expect(mockedSessions.findByHash).not.toHaveBeenCalled();
    });

    it('rejects rather than resolving when the lookup itself fails', async () => {
        // A database error must not be read as "no such token" OR as success. It rejects, and the
        // caller answers 500 rather than silently logging someone out or letting them in.
        const token = await signAs('refresh-secret', { id: USER_ID }, { expiresIn: 3600 });
        mockedSessions.findByHash.mockRejectedValue(new Error('connection lost'));

        await expect(verifyRefreshToken(token)).rejects.toThrow('connection lost');
    });
});

describe('the signing-key ring', () => {
    it('stamps the kid of the key it actually signed with', async () => {
        mintable();

        const token = await createRefreshToken(USER_ID);

        expect(decodeProtectedHeader(token).kid).toBe(keyId('refresh-secret'));
    });

    it('still verifies a token signed under an entry a rotation later prepends past', async () => {
        // The property rotation depends on: a token signed moments before a new key is
        // prepended must not be invalidated by that deploy.
        const token = await signAs('refresh-secret', { id: USER_ID }, { expiresIn: 3600 });
        holdingLive();

        setEnvironment({ NODE_TOKEN_REFRESH: 'new-refresh-secret,refresh-secret' });

        await expect(verifyRefreshToken(token)).resolves.toMatchObject({ id: USER_ID });
    });

    it("signs new tokens with the ring's first entry once one is prepended", async () => {
        setEnvironment({ NODE_TOKEN_REFRESH: 'new-refresh-secret,refresh-secret' });
        mintable();

        const token = await createRefreshToken(USER_ID);

        expect(decodeProtectedHeader(token).kid).toBe(keyId('new-refresh-secret'));
    });

    it('rejects a kid naming a key already dropped from the ring', async () => {
        // The other half of rotation: once an old secret is removed, a token still carrying its
        // kid is a retired key presented as current — 401, "log in again", never a crash.
        const token = await signAs('refresh-secret', { id: USER_ID }, { expiresIn: 3600 });

        setEnvironment({ NODE_TOKEN_REFRESH: 'new-refresh-secret' });

        await expect(verifyRefreshToken(token)).rejects.toThrow();
        expect(mockedSessions.findByHash).not.toHaveBeenCalled();
    });

    it('behaves identically to an unrotated deployment when the ring holds one entry', async () => {
        // "A ring of one behaves precisely as today" — the whole point of the migration.
        mintable();

        const token = await createRefreshToken(USER_ID);
        holdingLive();

        await expect(verifyRefreshToken(token)).resolves.toMatchObject({ id: USER_ID });
    });
});

describe('createRefreshToken', () => {
    it('stores a `jwt` session row holding the digest of the token it returns', async () => {
        mintable();

        const token = await createRefreshToken(USER_ID);

        expect(mockedSessions.insert).toHaveBeenCalledTimes(1);
        // Only the digest is stored: the token's value is as good as a password.
        expect(mockedSessions.insert).toHaveBeenCalledWith(
            expect.objectContaining({ mode: 'jwt', tokenHash: hashToken(token) })
        );
    });

    it('starts a new session family and stamps when the sign-in happened', async () => {
        mintable();

        await createRefreshToken(USER_ID);

        const [row] = mockedSessions.insert.mock.calls[0] as [
            { familyId: unknown; startedAt: Date }
        ];
        expect(row.familyId).toBeDefined();
        expect(row.startedAt).toBeInstanceOf(Date);
    });

    it('signs the id with the refresh secret, not the access one', async () => {
        mintable();

        const token = await createRefreshToken(USER_ID);

        // Verifies against the refresh secret...
        holdingLive();
        await expect(verifyRefreshToken(token)).resolves.toMatchObject({ id: USER_ID });
        // ...and is not accepted as a bearer token.
        await expect(verifyAccessToken(token)).rejects.toThrow();
    });

    it('pins HS256 rather than letting the header choose the algorithm', async () => {
        // `alg: none` and algorithm confusion are the classic JWT forgeries. Pinning at signing
        // time is half of the defence; the library's default verification is the other half.
        mintable();

        const token = await createRefreshToken(USER_ID);

        expect(decodeProtectedHeader(token).alg).toBe('HS256');
    });

    it('gives every issued token a unique id', async () => {
        // ``jti: randomUUID()``. Without it two logins by the same user inside the same second
        // produce byte-identical tokens, and revoking one revokes both.
        mintable();

        const first = await createRefreshToken(USER_ID);
        const second = await createRefreshToken(USER_ID);

        expect(first).not.toBe(second);
        expect((decodeJwt(first) as { jti: string }).jti).not.toBe(
            (decodeJwt(second) as { jti: string }).jti
        );
    });

    it('honours the remember-me window, in seconds on the token and milliseconds on the row', async () => {
        // Two units, one setting. The JWT's `exp` is in seconds and the stored expiry is a
        // JavaScript timestamp; getting the pair out of step makes the database and the token
        // disagree about when a session ends.
        mintable();

        const token = await createRefreshToken(USER_ID, 'long' as never);
        const { iat, exp } = decodeJwt(token) as { iat: number; exp: number };
        const [row] = mockedSessions.insert.mock.calls[0] as [{ startedAt: Date; expiresAt: Date }];

        expect(exp - iat).toBe(2_592_000);
        expect(row.expiresAt.getTime() - row.startedAt.getTime()).toBe(2_592_000 * 1000);
    });

    it('gives a browser-session login (no tier) the short tier as its server-side limit', async () => {
        mintable();

        const token = await createRefreshToken(USER_ID);
        const { iat, exp } = decodeJwt(token) as { iat: number; exp: number };
        const [row] = mockedSessions.insert.mock.calls[0] as [{ startedAt: Date; expiresAt: Date }];

        // NOT the access-token window (900s here): a session cookie still needs a real limit.
        expect(exp - iat).toBe(3600);
        expect(row.expiresAt.getTime() - row.startedAt.getTime()).toBe(3600 * 1000);
    });

    it('stamps the ticked tier as a claim, and stamps none for a browser-session login', async () => {
        mintable();

        const remembered = decodeJwt(await createRefreshToken(USER_ID, 'long' as never));
        const session = decodeJwt(await createRefreshToken(USER_ID));

        expect(remembered).toMatchObject({ remember: 'long' });
        expect(session).not.toHaveProperty('remember');
    });

    it('refuses to issue a token for a user that does not exist', async () => {
        mockedUsers.findAuthenticatableById.mockResolvedValue(null);

        await expect(createRefreshToken(USER_ID)).rejects.toThrow('User not found');
        expect(mockedSessions.insert).not.toHaveBeenCalled();
    });
});

describe('createAccessToken', () => {
    it('mints an access token from a refresh token that is still stored', async () => {
        const refresh = await signAs('refresh-secret', { id: USER_ID }, { expiresIn: 3600 });
        holdingLive();

        const access = await createAccessToken(refresh);

        await expect(verifyAccessToken(access)).resolves.toMatchObject({ id: USER_ID });
    });

    it('refuses to mint one from a revoked refresh token', async () => {
        // The property that makes logout mean anything: a revoked session must not be able to
        // keep issuing fresh access tokens for the remainder of the refresh token's lifetime.
        const refresh = await signAs('refresh-secret', { id: USER_ID }, { expiresIn: 3600 });
        mockedSessions.findByHash.mockResolvedValue(null);

        await expect(createAccessToken(refresh)).rejects.toThrow('Forbidden');
    });

    it('signs the access token with the access secret and pins HS256', async () => {
        const refresh = await signAs('refresh-secret', { id: USER_ID }, { expiresIn: 3600 });
        holdingLive();

        const access = await createAccessToken(refresh);

        expect(decodeProtectedHeader(access).alg).toBe('HS256');
        await expect(verifyRefreshToken(access)).rejects.toThrow();
    });

    it('gives the access token the short TTL, not the refresh window', async () => {
        // The whole point of the pair: the credential sent on every request is the short-lived
        // one. Signing it with the refresh window would make revocation irrelevant for a month.
        const refresh = await signAs('refresh-secret', { id: USER_ID }, { expiresIn: 3600 });
        holdingLive();

        const { iat, exp } = decodeJwt(await createAccessToken(refresh)) as {
            iat: number;
            exp: number;
        };

        expect(exp - iat).toBe(900);
    });
});

describe('createAccessToken carrying the tier', () => {
    it("copies the refresh token's tier onto the access token, and omits it when there is none", async () => {
        holdingLive();
        const remembered = await signAs(
            'refresh-secret',
            { id: USER_ID, remember: 'medium' },
            { expiresIn: 3600 }
        );
        const session = await signAs('refresh-secret', { id: USER_ID }, { expiresIn: 3600 });

        expect(decodeJwt(await createAccessToken(remembered))).toMatchObject({
            remember: 'medium'
        });
        expect(decodeJwt(await createAccessToken(session))).not.toHaveProperty('remember');
    });

    it('keeps the access window even for a long-tier session', async () => {
        holdingLive();
        const refresh = await signAs(
            'refresh-secret',
            { id: USER_ID, remember: 'long' },
            { expiresIn: 3600 }
        );

        const { iat, exp } = decodeJwt(await createAccessToken(refresh)) as {
            iat: number;
            exp: number;
        };

        expect(exp - iat).toBe(900);
    });
});
