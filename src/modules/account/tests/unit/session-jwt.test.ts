/**
 * @module
 * `account/session/jwt.ts` — the token layer, at the unit level. Asserts the properties that keep
 * it SAFE: the two secrets never cross-verify, a refresh token is only valid while still stored,
 * `jwtid: randomUUID()` keeps two same-second logins from mutually revoking, and the signing ring
 * (item 4) rotates without a mass logout. `@modules/users` is REPLACED rather than driven — see
 * `tests/support/ports.ts`.
 *
 * Every fixture below signs with `keyid: keyId(secret)`, matching what `jwt.ts` itself stamps —
 * a fixture signed without one would verify against nothing, since `kid` is how a ring member is
 * found at all.
 */

import { sign, decode } from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { asStub } from '@tests/stub';
import { keyId } from '@modules/account/session/key-ring';

/*
 * The REPOSITORY, not the model: `session/jwt.ts` reaches `userRepository.findByTokenValue`,
 * `.findByIdWithCredentials` and `.tokenTouch` rather than running raw `Users` queries itself, so
 * this suite doubles those instead. What the QUERIES look like is asserted in
 * `users/tests/integration/repository.test.ts`, against a real store.
 */
jest.mock('@modules/users', () => ({
    ...jest.requireActual('@modules/users'),
    __esModule: true,
    userRepository: {
        findByTokenValue: jest.fn(),
        findByIdWithCredentials: jest.fn(),
        tokenTouch: jest.fn()
    }
}));

import {
    verifyAccessToken,
    verifyRefreshToken,
    createRefreshToken,
    createAccessToken,
    recordRefreshTokenUse
} from '@modules/account/session/jwt';
import { userRepository, TokenType } from '@modules/users';

const USER_ID = '507f1f77bcf86cd799439011';

const mockedUsers = asStub<{
    findByTokenValue: jest.Mock;
    findByIdWithCredentials: jest.Mock;
    tokenTouch: jest.Mock;
}>(userRepository);

/** A user document double, carrying only the one method `createRefreshToken` calls. */
const userDouble = () => {
    const tokenAdd = jest.fn().mockResolvedValue('stored');
    return { tokenAdd, select: undefined };
};

/**
 * `userRepository.findByIdWithCredentials(id)` — one call to stub, so this file never has to walk
 * a `findById(...).select('+tokens')` chain of its own.
 */
const findByIdReturning = (user: unknown) => {
    mockedUsers.findByIdWithCredentials.mockResolvedValue(user);
};

/**
 * Sign a fixture the way `jwt.ts` itself signs — `keyid` stamped from the secret. A fixture built
 * with plain `sign()` would carry no `kid` at all and never match a ring member.
 */
const signAs = (secret: string, payload: object, options: SignOptions = {}) =>
    sign(payload, secret, { ...options, keyid: keyId(secret) });

beforeEach(() => {
    // `reset`, not `clear`: these doubles are given a resolved or rejected value per test, and
    // `clearAllMocks` keeps the implementation while wiping only the call log — so a rejection
    // set in one case leaks into the next and fails it with the wrong error.
    jest.resetAllMocks();
    process.env.NODE_TOKEN_ACCESS = 'access-secret';
    process.env.NODE_TOKEN_REFRESH = 'refresh-secret';
    process.env.NODE_TOKEN_ACCESS_TIME = '900';
    process.env.NODE_TOKEN_REFRESH_TIME_SHORT = '3600';
    process.env.NODE_TOKEN_REFRESH_TIME_LONG = '2592000';
});

describe('verifyAccessToken', () => {
    it('resolves the payload of a token signed with the access secret', async () => {
        const token = signAs('access-secret', { id: USER_ID }, { expiresIn: 900 });

        await expect(verifyAccessToken(token)).resolves.toMatchObject({ id: USER_ID });
    });

    it('rejects a token signed with the REFRESH secret', async () => {
        // The separation that matters: a refresh token presented as a bearer token must not be
        // accepted, or the long-lived credential becomes the API credential.
        const refresh = signAs('refresh-secret', { id: USER_ID }, { expiresIn: 3600 });

        await expect(verifyAccessToken(refresh)).rejects.toThrow();
    });

    it('rejects a token whose signature does not verify', async () => {
        // Claims the real ring member's `kid` but was actually signed with a different secret —
        // an attacker who can read the (public) kid format but not the secret itself.
        const forged = sign({ id: USER_ID }, 'wrong-secret', { keyid: keyId('access-secret') });

        await expect(verifyAccessToken(forged)).rejects.toThrow();
    });

    it('rejects an expired token', async () => {
        const expired = signAs('access-secret', { id: USER_ID }, { expiresIn: -10 });

        await expect(verifyAccessToken(expired)).rejects.toThrow();
    });

    it('rejects nonsense rather than resolving undefined', async () => {
        await expect(verifyAccessToken('not-a-jwt')).rejects.toThrow();
    });
});

describe('verifyRefreshToken', () => {
    it('resolves when the signature verifies AND the token is still stored', async () => {
        const token = signAs('refresh-secret', { id: USER_ID }, { expiresIn: 3600 });
        mockedUsers.findByTokenValue.mockResolvedValue({ _id: USER_ID });

        await expect(verifyRefreshToken(token)).resolves.toMatchObject({ id: USER_ID });
        // Looked up BY THE TOKEN, not by the id in its payload: the stored list is the authority
        // on which sessions are live, and a payload cannot be asked whether it was revoked.
        expect(mockedUsers.findByTokenValue).toHaveBeenCalledWith(token);
    });

    it('rejects a validly signed token that is no longer stored', async () => {
        // Revocation. Without this branch, logout and session revocation are cosmetic: the JWT
        // still verifies until it expires, whatever the database says.
        const token = signAs('refresh-secret', { id: USER_ID }, { expiresIn: 3600 });
        mockedUsers.findByTokenValue.mockResolvedValue(null);

        await expect(verifyRefreshToken(token)).rejects.toThrow('Forbidden');
    });

    it('rejects a token signed with the ACCESS secret', async () => {
        const access = signAs('access-secret', { id: USER_ID }, { expiresIn: 900 });

        await expect(verifyRefreshToken(access)).rejects.toThrow();
    });

    it('does not reach the database when the signature already fails', async () => {
        // A forged token must cost nothing: checking the signature first is what stops an
        // unauthenticated flood from becoming a database query per request.
        await expect(verifyRefreshToken('not-a-jwt')).rejects.toThrow();
        expect(mockedUsers.findByTokenValue).not.toHaveBeenCalled();
    });

    it('rejects rather than resolving when the lookup itself fails', async () => {
        // A database error must not be read as "no such token" OR as success. It rejects, and the
        // caller answers 500 rather than silently logging someone out or letting them in.
        const token = signAs('refresh-secret', { id: USER_ID }, { expiresIn: 3600 });
        mockedUsers.findByTokenValue.mockRejectedValue(new Error('connection lost'));

        await expect(verifyRefreshToken(token)).rejects.toThrow('connection lost');
    });
});

describe('the signing-key ring', () => {
    it('stamps the kid of the key it actually signed with', async () => {
        const user = userDouble();
        findByIdReturning(user);

        await createRefreshToken(USER_ID);
        const token = user.tokenAdd.mock.calls[0][2] as string;

        expect(decode(token, { complete: true })!.header.kid).toBe(keyId('refresh-secret'));
    });

    it('still verifies a token signed under an entry a rotation later prepends past', async () => {
        // The property rotation depends on: a token signed moments before a new key is
        // prepended must not be invalidated by that deploy.
        const token = signAs('refresh-secret', { id: USER_ID }, { expiresIn: 3600 });
        mockedUsers.findByTokenValue.mockResolvedValue({ _id: USER_ID });

        process.env.NODE_TOKEN_REFRESH = 'new-refresh-secret,refresh-secret';

        await expect(verifyRefreshToken(token)).resolves.toMatchObject({ id: USER_ID });
    });

    it("signs new tokens with the ring's first entry once one is prepended", async () => {
        process.env.NODE_TOKEN_REFRESH = 'new-refresh-secret,refresh-secret';
        const user = userDouble();
        findByIdReturning(user);

        await createRefreshToken(USER_ID);
        const token = user.tokenAdd.mock.calls[0][2] as string;

        expect(decode(token, { complete: true })!.header.kid).toBe(keyId('new-refresh-secret'));
    });

    it('rejects a kid naming a key already dropped from the ring', async () => {
        // The other half of rotation: once an old secret is removed, a token still carrying its
        // kid is a retired key presented as current — 401, "log in again", never a crash.
        const token = signAs('refresh-secret', { id: USER_ID }, { expiresIn: 3600 });

        process.env.NODE_TOKEN_REFRESH = 'new-refresh-secret';

        await expect(verifyRefreshToken(token)).rejects.toThrow();
        expect(mockedUsers.findByTokenValue).not.toHaveBeenCalled();
    });

    it('behaves identically to an unrotated deployment when the ring holds one entry', async () => {
        // "A ring of one behaves precisely as today" — the whole point of the migration.
        const user = userDouble();
        findByIdReturning(user);

        await createRefreshToken(USER_ID);
        const token = user.tokenAdd.mock.calls[0][2] as string;
        mockedUsers.findByTokenValue.mockResolvedValue({ _id: USER_ID });

        await expect(verifyRefreshToken(token)).resolves.toMatchObject({ id: USER_ID });
    });
});

describe('createRefreshToken', () => {
    it('stores a refresh token against the user and returns what the model returns', async () => {
        const user = userDouble();
        findByIdReturning(user);

        await expect(createRefreshToken(USER_ID)).resolves.toBe('stored');
        expect(user.tokenAdd).toHaveBeenCalledTimes(1);
        // The type matters: `tokenAdd` is shared with reset, verify and delete tokens, and a
        // refresh token filed under the wrong type is revoked by the wrong operation.
        expect(user.tokenAdd.mock.calls[0][0]).toBe(TokenType.REFRESH);
    });

    it('reads the token list explicitly, which the default projection excludes', async () => {
        // The `+tokens` projection is what makes `tokenAdd` append to a loaded field rather than
        // an undefined one; asking for it is what `findByIdWithCredentials` MEANS, and that the
        // repository actually applies it is asserted in its own integration spec.
        findByIdReturning(userDouble());

        await createRefreshToken(USER_ID);

        expect(mockedUsers.findByIdWithCredentials).toHaveBeenCalledWith(USER_ID);
    });

    it('signs the id with the refresh secret, not the access one', async () => {
        const user = userDouble();
        findByIdReturning(user);

        await createRefreshToken(USER_ID);
        const token = user.tokenAdd.mock.calls[0][2] as string;

        // Verifies against the refresh secret...
        mockedUsers.findByTokenValue.mockResolvedValue({ _id: USER_ID });
        await expect(verifyRefreshToken(token)).resolves.toMatchObject({ id: USER_ID });
        // ...and is not accepted as a bearer token.
        await expect(verifyAccessToken(token)).rejects.toThrow();
    });

    it('pins HS256 rather than letting the header choose the algorithm', async () => {
        // `alg: none` and algorithm confusion are the classic JWT forgeries. Pinning at signing
        // time is half of the defence; the library's default verification is the other half.
        const user = userDouble();
        findByIdReturning(user);

        await createRefreshToken(USER_ID);
        const token = user.tokenAdd.mock.calls[0][2] as string;

        expect(decode(token, { complete: true })!.header.alg).toBe('HS256');
    });

    it('gives every issued token a unique id', async () => {
        // `jwtid: randomUUID()`. Without it two logins by the same user inside the same second
        // produce byte-identical tokens, and revoking one revokes both.
        const user = userDouble();
        findByIdReturning(user);

        await createRefreshToken(USER_ID);
        await createRefreshToken(USER_ID);

        const [first, second] = user.tokenAdd.mock.calls.map((call) => call[2] as string);
        expect(first).not.toBe(second);
        expect((decode(first) as { jti: string }).jti).not.toBe(
            (decode(second) as { jti: string }).jti
        );
    });

    it('honours the remember-me window, in seconds on the token and milliseconds on the record', async () => {
        // Two units, one setting. The JWT's `exp` is in seconds and the stored expiry is a
        // JavaScript timestamp; getting the pair out of step makes the database and the token
        // disagree about when a session ends.
        const user = userDouble();
        findByIdReturning(user);

        await createRefreshToken(USER_ID, 'long' as never);
        const token = user.tokenAdd.mock.calls[0][2] as string;
        const { iat, exp } = decode(token) as { iat: number; exp: number };

        expect(exp - iat).toBe(2_592_000);
        expect(user.tokenAdd.mock.calls[0][1]).toBe(2_592_000 * 1000);
    });

    it('refuses to issue a token for a user that does not exist', async () => {
        findByIdReturning(null);

        await expect(createRefreshToken(USER_ID)).rejects.toThrow('User not found');
    });
});

describe('createAccessToken', () => {
    it('mints an access token from a refresh token that is still stored', async () => {
        const refresh = signAs('refresh-secret', { id: USER_ID }, { expiresIn: 3600 });
        mockedUsers.findByTokenValue.mockResolvedValue({ _id: USER_ID });

        const access = await createAccessToken(refresh);

        await expect(verifyAccessToken(access)).resolves.toMatchObject({ id: USER_ID });
    });

    it('refuses to mint one from a revoked refresh token', async () => {
        // The property that makes logout mean anything: a revoked session must not be able to
        // keep issuing fresh access tokens for the remainder of the refresh token's lifetime.
        const refresh = signAs('refresh-secret', { id: USER_ID }, { expiresIn: 3600 });
        mockedUsers.findByTokenValue.mockResolvedValue(null);

        await expect(createAccessToken(refresh)).rejects.toThrow('Forbidden');
    });

    it('signs the access token with the access secret and pins HS256', async () => {
        const refresh = signAs('refresh-secret', { id: USER_ID }, { expiresIn: 3600 });
        mockedUsers.findByTokenValue.mockResolvedValue({ _id: USER_ID });

        const access = await createAccessToken(refresh);

        expect(decode(access, { complete: true })!.header.alg).toBe('HS256');
        await expect(verifyRefreshToken(access)).rejects.toThrow();
    });

    it('gives the access token the short TTL, not the refresh window', async () => {
        // The whole point of the pair: the credential sent on every request is the short-lived
        // one. Signing it with the refresh window would make revocation irrelevant for a month.
        const refresh = signAs('refresh-secret', { id: USER_ID }, { expiresIn: 3600 });
        mockedUsers.findByTokenValue.mockResolvedValue({ _id: USER_ID });

        const { iat, exp } = decode(await createAccessToken(refresh)) as {
            iat: number;
            exp: number;
        };

        expect(exp - iat).toBe(900);
    });
});

describe('recordRefreshTokenUse', () => {
    it('stamps the token it was given, and only that one', async () => {
        mockedUsers.tokenTouch.mockResolvedValue({ modifiedCount: 1 });

        await recordRefreshTokenUse('a-token');

        /*
         * The positional `$` that stamps the token that MATCHED — not the first in the array — is
         * `userRepository.tokenTouch`'s, proven against a real document in
         * `users/tests/integration/repository.test.ts`. What this file owns is that the right
         * value is handed over, exactly once.
         */
        expect(mockedUsers.tokenTouch).toHaveBeenCalledTimes(1);
        expect(mockedUsers.tokenTouch).toHaveBeenCalledWith('a-token');
    });

    it('resolves to undefined rather than the driver"s write result', async () => {
        // Callers await it for ordering only; leaking the raw result invites someone to branch on
        // `modifiedCount`, which is legitimately 0 for a token used twice in the same millisecond.
        mockedUsers.tokenTouch.mockResolvedValue({ modifiedCount: 1 });

        await expect(recordRefreshTokenUse('a-token')).resolves.toBeUndefined();
    });

    it('swallows a failure, because bookkeeping must not fail a login', async () => {
        // Best-effort by design: this records WHEN a session was last used. If it throws, an
        // otherwise valid token refresh turns into a 500 and the user is signed out for a
        // statistic.
        mockedUsers.tokenTouch.mockRejectedValue(new Error('connection lost'));

        await expect(recordRefreshTokenUse('a-token')).resolves.toBeUndefined();
    });
});
