import { asStub } from '@tests/stub';
import { postLogin } from '@modules/account/controllers/post-login';
import { getRefreshToken } from '@modules/account/controllers/get-refresh-token';
import { accountService, runTokenCleanup } from '@modules/account/services';
import { createAccessToken } from '@modules/account/session/jwt';

/*
 * One factory for the whole service folder. `runTokenCleanup` and `login` used to be two modules
 * (`../token-cleanup` and `../service`) and so took a `jest.mock` each; they are two members of one
 * barrel now, and a second `jest.mock` of the same path REPLACES the first rather than merging with
 * it — which would leave whichever half came first undefined at call time.
 */
jest.mock('@modules/account/services', () => ({
    __esModule: true,
    runTokenCleanup: jest.fn(),
    accountService: {
        login: jest.fn()
    }
}));

/*
 * The controllers reach `../jwt` and `../cookies` directly, not through this module's barrel, so
 * the mocks have to name the implementation files. Mocking the barrel would replace a surface
 * nothing under test imports and every assertion would count zero calls.
 */
jest.mock('@modules/account/session/jwt', () => ({
    __esModule: true,
    createRefreshToken: jest.fn(),
    createAccessToken: jest.fn()
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
const mockCreateAccessToken = createAccessToken as jest.MockedFunction<typeof createAccessToken>;

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
        mockCreateAccessToken.mockResolvedValue('new-access-token');

        const request = {
            params: {},
            cookies: {
                jwt: 'refresh-token'
            }
        };
        const response = {} as Parameters<typeof getRefreshToken>[1];

        await getRefreshToken(asStub<Parameters<typeof getRefreshToken>[0]>(request), response);

        expect(mockRunTokenCleanup).toHaveBeenCalledTimes(1);
        expect(mockCreateAccessToken).toHaveBeenCalledWith('refresh-token');
        expect(mockRunTokenCleanup.mock.invocationCallOrder[0]).toBeLessThan(
            mockCreateAccessToken.mock.invocationCallOrder[0]
        );
    });

    it('does not run cleanup in refresh flow when refresh token is missing', async () => {
        const request = {
            params: {},
            cookies: {}
        };
        const response = {} as Parameters<typeof getRefreshToken>[1];

        await getRefreshToken(asStub<Parameters<typeof getRefreshToken>[0]>(request), response);

        expect(mockRunTokenCleanup).not.toHaveBeenCalled();
        expect(mockCreateAccessToken).not.toHaveBeenCalled();
    });
});
