/**
 * `account/session/jwt.ts` — the token layer, at the unit level.
 *
 * The integration suites exercise these functions against a real database and assert the flows
 * work. What they cannot assert cheaply is the set of properties that make the flows SAFE, each of
 * which fails silently rather than throwing:
 *
 *   1. THE TWO SECRETS ARE DIFFERENT SECRETS. An access token must not verify as a refresh token
 *      and vice versa. Collapse them — or mix up which getter each function calls — and a
 *      short-lived access token becomes a session that outlives every revocation, because
 *      revocation only ever touched the refresh list.
 *   2. A REFRESH TOKEN IS ONLY VALID WHILE IT IS STILL STORED. `verifyRefreshToken` checks the
 *      signature AND that the token is still in the user's `tokens`. Drop the second half and
 *      logout, logout-everywhere and session revocation all stop having any effect: the JWT is
 *      still cryptographically valid until it expires.
 *   3. `createAccessToken` GOES THROUGH THAT CHECK. It is the one place a revoked session could
 *      otherwise mint fresh access tokens indefinitely.
 *   4. TOKENS ARE UNIQUE PER ISSUE. `jwtid: randomUUID()` is what stops two logins by the same
 *      user in the same second from producing byte-identical tokens — which would make revoking
 *      one revoke the other.
 *
 * `@modules/users` is REPLACED rather than driven, so each of these is a property of this file
 * alone. See `tests/support/ports.ts` for why a namespace `jest.spyOn` is not used anywhere here.
 */
import { sign, decode } from 'jsonwebtoken';
import { asStub } from '@tests/stub';

/*
 * The REPOSITORY, not the model. `session/jwt.ts` used to run `Users.findOne`,
 * `Users.findById().select('+tokens')` and a positional `Users.updateOne` itself — three raw
 * queries against another module's collection, from a file that is not a repository. They are now
 * `userRepository.findByTokenValue`, `.findByIdWithCredentials` and `.tokenTouch`, so this suite
 * doubles those instead. What the QUERIES look like — the `+tokens` projection, the positional
 * `tokens.$` — moved with them and is asserted in `users/tests/integration/repository.test.ts`,
 * against a real store rather than against a mock's call log.
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
 * `userRepository.findByIdWithCredentials(id)` — one call now, where it used to be a
 * `findById(...).select('+tokens')` chain this file had to walk itself.
 */
const findByIdReturning = (user: unknown) => {
    mockedUsers.findByIdWithCredentials.mockResolvedValue(user);
};

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
        const token = sign({ id: USER_ID }, 'access-secret', { expiresIn: 900 });

        await expect(verifyAccessToken(token)).resolves.toMatchObject({ id: USER_ID });
    });

    it('rejects a token signed with the REFRESH secret', async () => {
        // The separation that matters: a refresh token presented as a bearer token must not be
        // accepted, or the long-lived credential becomes the API credential.
        const refresh = sign({ id: USER_ID }, 'refresh-secret', { expiresIn: 3600 });

        await expect(verifyAccessToken(refresh)).rejects.toThrow();
    });

    it('rejects a token whose signature does not verify', async () => {
        await expect(verifyAccessToken(sign({ id: USER_ID }, 'wrong-secret'))).rejects.toThrow();
    });

    it('rejects an expired token', async () => {
        const expired = sign({ id: USER_ID }, 'access-secret', { expiresIn: -10 });

        await expect(verifyAccessToken(expired)).rejects.toThrow();
    });

    it('rejects nonsense rather than resolving undefined', async () => {
        await expect(verifyAccessToken('not-a-jwt')).rejects.toThrow();
    });
});

describe('verifyRefreshToken', () => {
    it('resolves when the signature verifies AND the token is still stored', async () => {
        const token = sign({ id: USER_ID }, 'refresh-secret', { expiresIn: 3600 });
        mockedUsers.findByTokenValue.mockResolvedValue({ _id: USER_ID });

        await expect(verifyRefreshToken(token)).resolves.toMatchObject({ id: USER_ID });
        // Looked up BY THE TOKEN, not by the id in its payload: the stored list is the authority
        // on which sessions are live, and a payload cannot be asked whether it was revoked.
        expect(mockedUsers.findByTokenValue).toHaveBeenCalledWith(token);
    });

    it('rejects a validly signed token that is no longer stored', async () => {
        // Revocation. Without this branch, logout and session revocation are cosmetic: the JWT
        // still verifies until it expires, whatever the database says.
        const token = sign({ id: USER_ID }, 'refresh-secret', { expiresIn: 3600 });
        mockedUsers.findByTokenValue.mockResolvedValue(null);

        await expect(verifyRefreshToken(token)).rejects.toThrow('Forbidden');
    });

    it('rejects a token signed with the ACCESS secret', async () => {
        const access = sign({ id: USER_ID }, 'access-secret', { expiresIn: 900 });

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
        const token = sign({ id: USER_ID }, 'refresh-secret', { expiresIn: 3600 });
        mockedUsers.findByTokenValue.mockRejectedValue(new Error('connection lost'));

        await expect(verifyRefreshToken(token)).rejects.toThrow('connection lost');
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
        const refresh = sign({ id: USER_ID }, 'refresh-secret', { expiresIn: 3600 });
        mockedUsers.findByTokenValue.mockResolvedValue({ _id: USER_ID });

        const access = await createAccessToken(refresh);

        await expect(verifyAccessToken(access)).resolves.toMatchObject({ id: USER_ID });
    });

    it('refuses to mint one from a revoked refresh token', async () => {
        // The property that makes logout mean anything: a revoked session must not be able to
        // keep issuing fresh access tokens for the remainder of the refresh token's lifetime.
        const refresh = sign({ id: USER_ID }, 'refresh-secret', { expiresIn: 3600 });
        mockedUsers.findByTokenValue.mockResolvedValue(null);

        await expect(createAccessToken(refresh)).rejects.toThrow('Forbidden');
    });

    it('signs the access token with the access secret and pins HS256', async () => {
        const refresh = sign({ id: USER_ID }, 'refresh-secret', { expiresIn: 3600 });
        mockedUsers.findByTokenValue.mockResolvedValue({ _id: USER_ID });

        const access = await createAccessToken(refresh);

        expect(decode(access, { complete: true })!.header.alg).toBe('HS256');
        await expect(verifyRefreshToken(access)).rejects.toThrow();
    });

    it('gives the access token the short TTL, not the refresh window', async () => {
        // The whole point of the pair: the credential sent on every request is the short-lived
        // one. Signing it with the refresh window would make revocation irrelevant for a month.
        const refresh = sign({ id: USER_ID }, 'refresh-secret', { expiresIn: 3600 });
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
         * The positional `$` that makes this stamp the token that MATCHED — rather than the first
         * in the array, which would show every session the last-used time of whichever one is
         * stored first — is `userRepository.tokenTouch`'s, and
         * `users/tests/integration/repository.test.ts` proves it against a real document. What
         * this file owns is that the right value is handed over, exactly once.
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
