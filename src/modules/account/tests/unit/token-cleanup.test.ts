/**
 * @module
 * The token-cleanup pre-flight step wired into `postLogin` and `getRefreshToken`. It is a sweep
 * across every user document, so it must not run on a request that cannot possibly succeed — a
 * refresh call with no cookie at all — or every anonymous hit costs a full-table pass. Where it
 * DOES run, it must run BEFORE the credential check, asserted via Jest's `invocationCallOrder`
 * rather than call counts, which can't tell "ran first" from "ran after".
 */

import { asStub } from '@tests/stub';
import { postLogin } from '@modules/account/controllers/post-login';
import { getRefreshToken } from '@modules/account/controllers/get-refresh-token';
import { accountService, runTokenCleanup } from '@modules/account/services';

/*
 * One `jest.mock` for the whole service folder: a second `jest.mock` of the same path REPLACES
 * the first rather than merging with it, which would leave whichever half came first undefined
 * at call time. `refreshAccessToken` is mocked here too, since `getRefreshToken` now calls it
 * instead of `../session/jwt` directly — this suite tests only that cleanup runs BEFORE it.
 */
jest.mock('@modules/account/services', () => ({
    __esModule: true,
    runTokenCleanup: jest.fn(),
    accountService: {
        login: jest.fn(),
        refreshAccessToken: jest.fn()
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

const mockRunTokenCleanup = runTokenCleanup as jest.MockedFunction<typeof runTokenCleanup>;
const mockLogin = accountService.login as jest.MockedFunction<typeof accountService.login>;
const mockRefreshAccessToken = accountService.refreshAccessToken as jest.MockedFunction<
    typeof accountService.refreshAccessToken
>;

describe('Auth controllers token cleanup trigger', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRunTokenCleanup.mockResolvedValue();
    });

    it('runs cleanup before login authentication', async () => {
        mockLogin.mockResolvedValue({
            success: false,
            status: 401,
            message: 'Unauthorized',
            errors: [
                {
                    code: 'UNAUTHORIZED',
                    message: 'invalid credentials'
                }
            ],
            data: undefined as never
        });

        const request = {
            body: {
                email: 'user@example.com',
                password: 'Password1!'
            }
        };
        const response = {} as Parameters<typeof postLogin>[1];

        await postLogin(asStub<Parameters<typeof postLogin>[0]>(request), response);

        expect(mockRunTokenCleanup).toHaveBeenCalledTimes(1);
        expect(mockLogin).toHaveBeenCalledTimes(1);
        expect(mockRunTokenCleanup.mock.invocationCallOrder[0]).toBeLessThan(
            mockLogin.mock.invocationCallOrder[0]
        );
    });

    it('runs cleanup before refresh-token access token creation', async () => {
        mockRefreshAccessToken.mockResolvedValue('new-access-token');

        const request = {
            params: {},
            cookies: {
                jwt: 'refresh-token'
            }
        };
        const response = {} as Parameters<typeof getRefreshToken>[1];

        await getRefreshToken(asStub<Parameters<typeof getRefreshToken>[0]>(request), response);

        expect(mockRunTokenCleanup).toHaveBeenCalledTimes(1);
        expect(mockRefreshAccessToken).toHaveBeenCalledWith('refresh-token', expect.anything());
        expect(mockRunTokenCleanup.mock.invocationCallOrder[0]).toBeLessThan(
            mockRefreshAccessToken.mock.invocationCallOrder[0]
        );
    });

    it('does not run cleanup in refresh flow when refresh token is missing', async () => {
        mockRefreshAccessToken.mockRejectedValue(new Error('Refresh token missing'));

        const request = {
            params: {},
            cookies: {}
        };
        const response = {} as Parameters<typeof getRefreshToken>[1];

        await getRefreshToken(asStub<Parameters<typeof getRefreshToken>[0]>(request), response);

        // A sweep of every user document, for a request that cannot succeed. The service is still
        // called: the missing cookie is a refusal it reports on, not one the controller decides.
        expect(mockRunTokenCleanup).not.toHaveBeenCalled();
        expect(mockRefreshAccessToken).toHaveBeenCalledWith(undefined, expect.anything());
    });
});
