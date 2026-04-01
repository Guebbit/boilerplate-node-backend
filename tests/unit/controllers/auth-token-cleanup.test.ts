import postLogin from '@controllers/account/post-login';
import getRefreshToken from '@controllers/account/get-refresh-token';
import UserService from '@services/users';
import { runTokenCleanup } from '@utils/token-cleanup';
import { createAccessToken } from '@middlewares/auth-jwt';

jest.mock('@utils/token-cleanup', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    runTokenCleanup: jest.fn()
}));

jest.mock('@services/users', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    default: {
        login: jest.fn()
    }
}));

jest.mock('@middlewares/auth-jwt', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    createRefreshToken: jest.fn(),
    createRefreshCookie: jest.fn(),
    createLoggedCookie: jest.fn(),
    createAccessToken: jest.fn()
}));

jest.mock('@utils/response', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    successResponse: jest.fn(),
    rejectResponse: jest.fn()
}));

const mockRunTokenCleanup = runTokenCleanup as jest.MockedFunction<typeof runTokenCleanup>;
const mockLogin = UserService.login as jest.MockedFunction<typeof UserService.login>;
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
            errors: ['invalid credentials'],
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
