import { postLogin } from '@modules/account/controllers/post-login';
import { getRefreshToken } from '@modules/account/controllers/get-refresh-token';
import { authService } from '@modules/account/service';
import { runTokenCleanup } from '@modules/account/token-cleanup';
import { createAccessToken } from '@modules/account/jwt';

jest.mock('@modules/account/token-cleanup', () => ({
    __esModule: true,
    runTokenCleanup: jest.fn()
}));

jest.mock('@modules/account/service', () => ({
    __esModule: true,
    authService: {
        login: jest.fn()
    }
}));

/*
 * The controllers reach `../jwt` and `../cookies` directly, not through this module's barrel, so
 * the mocks have to name the implementation files. Mocking the barrel would replace a surface
 * nothing under test imports and every assertion would count zero calls.
 */
jest.mock('@modules/account/jwt', () => ({
    __esModule: true,
    createRefreshToken: jest.fn(),
    createAccessToken: jest.fn()
}));

jest.mock('@modules/account/cookies', () => ({
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
const mockLogin = authService.login as jest.MockedFunction<typeof authService.login>;
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

        await postLogin(request as unknown as Parameters<typeof postLogin>[0], response);

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

        await getRefreshToken(
            request as unknown as Parameters<typeof getRefreshToken>[0],
            response
        );

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

        await getRefreshToken(
            request as unknown as Parameters<typeof getRefreshToken>[0],
            response
        );

        expect(mockRunTokenCleanup).not.toHaveBeenCalled();
        expect(mockCreateAccessToken).not.toHaveBeenCalled();
    });
});
