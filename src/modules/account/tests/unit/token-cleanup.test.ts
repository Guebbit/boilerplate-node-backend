/**
 * @module
 * Where the token housekeeping is wired into `postLogin` and `getRefreshToken`. It used to be a
 * whole-collection sweep ahead of the credential check, which let an anonymous request schedule an
 * unindexed scan. Now a login prunes only the account it has just AUTHENTICATED, and the refresh
 * controller runs no sweep at all (the rotation prunes its own account, in `session/jwt.ts`).
 * Order is asserted via Jest's `invocationCallOrder`, which can tell "ran after" from "ran".
 */

import { asStub } from '@tests/stub';
import { postLogin } from '@modules/account/controllers/post-login';
import { getRefreshToken } from '@modules/account/controllers/get-refresh-token';
import { accountService } from '@modules/account/services';
import { PLAIN_PASSWORD } from '@modules/users/tests/factories';

/*
 * One `jest.mock` for the whole service folder: a second `jest.mock` of the same path REPLACES
 * the first rather than merging with it, which would leave whichever half came first undefined
 * at call time.
 */
jest.mock('@modules/account/services', () => ({
    __esModule: true,
    accountService: {
        login: jest.fn(),
        pruneOwnExpiredTokens: jest.fn(),
        refreshAccessToken: jest.fn()
    },
    twoFactorService: {
        buildLoginChallenge: jest.fn()
    }
}));

jest.mock('@modules/account/session/cookies', () => ({
    __esModule: true,
    createRefreshCookie: jest.fn(),
    createLoggedCookie: jest.fn()
}));

jest.mock('@infrastructure/http/response', () => ({
    __esModule: true,
    successResponse: jest.fn(),
    rejectResponse: jest.fn()
}));

const mockLogin = accountService.login as jest.MockedFunction<typeof accountService.login>;
const mockPrune = accountService.pruneOwnExpiredTokens as jest.MockedFunction<
    typeof accountService.pruneOwnExpiredTokens
>;
const mockRefreshAccessToken = accountService.refreshAccessToken as jest.MockedFunction<
    typeof accountService.refreshAccessToken
>;

/** A login request body the controller accepts. */
const loginRequest = () =>
    asStub<Parameters<typeof postLogin>[0]>({
        body: { email: 'user@example.com', password: PLAIN_PASSWORD }
    });

describe('login prunes only the account it authenticated', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPrune.mockResolvedValue();
    });

    it('prunes nothing when the credentials are refused', async () => {
        mockLogin.mockResolvedValue({
            success: false,
            status: 401,
            message: 'Unauthorized',
            errors: [{ code: 'UNAUTHORIZED', message: 'invalid credentials' }],
            data: undefined as never
        });

        await postLogin(loginRequest(), {} as Parameters<typeof postLogin>[1]);

        // An unknown address or a wrong password costs the database nothing here.
        expect(mockLogin).toHaveBeenCalledTimes(1);
        expect(mockPrune).not.toHaveBeenCalled();
    });

    it('prunes the authenticated account, and only after authenticating', async () => {
        mockLogin.mockResolvedValue(
            asStub<Awaited<ReturnType<typeof accountService.login>>>({
                success: true,
                status: 200,
                message: 'ok',
                // Two-factor on: the branch that returns before a session is minted, so the case
                // needs no cookie or role machinery to observe the prune.
                data: { _id: { toString: () => 'account-7' }, twoFactorEnabledAt: new Date() }
            })
        );

        await postLogin(loginRequest(), {} as Parameters<typeof postLogin>[1]);

        expect(mockPrune).toHaveBeenCalledTimes(1);
        expect(mockPrune).toHaveBeenCalledWith('account-7');
        expect(mockLogin.mock.invocationCallOrder[0]).toBeLessThan(
            mockPrune.mock.invocationCallOrder[0]
        );
    });
});

describe('the refresh controller runs no sweep of its own', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it.each([
        ['a refresh cookie', { jwt: 'refresh-token' }],
        ['no cookie at all', {}]
    ])('with %s, only the exchange runs', async (_label, cookies) => {
        mockRefreshAccessToken.mockResolvedValue({
            accessToken: 'new-access-token',
            refreshToken: 'new-refresh-token',
            refreshMaxAgeMs: 3_600_000
        });

        await getRefreshToken(
            asStub<Parameters<typeof getRefreshToken>[0]>({ params: {}, cookies }),
            {} as Parameters<typeof getRefreshToken>[1]
        );

        // The exchange is called either way: a missing cookie is a refusal it reports on. The
        // pruning is the rotation's, once its own lookup is done.
        expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
        expect(mockPrune).not.toHaveBeenCalled();
    });
});
