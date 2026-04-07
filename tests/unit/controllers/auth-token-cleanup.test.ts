import { postLogin } from '@controllers/account/post-login';
import { getRefreshToken } from '@controllers/account/get-refresh-token';
import { userService } from '@services/users';
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
    userService: {
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
const mockLogin = userService.login as jest.MockedFunction<typeof userService.login>;
const mockCreateAccessToken = createAccessToken as jest.MockedFunction<typeof createAccessToken>;
type PostLoginRequest = Parameters<typeof postLogin>[0];
type GetRefreshTokenRequest = Parameters<typeof getRefreshToken>[0];
type LoginRequestMock = Pick<PostLoginRequest, 'body'>;
type RefreshTokenRequestMock = Pick<GetRefreshTokenRequest, 'params' | 'cookies'>;

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

        const request: LoginRequestMock = {
            body: {
                email: 'user@example.com',
                password: 'Password1!'
            }
        };
        const response = {} as Parameters<typeof postLogin>[1];

        await postLogin(request as PostLoginRequest, response);

        expect(mockRunTokenCleanup).toHaveBeenCalledTimes(1);
        expect(mockLogin).toHaveBeenCalledTimes(1);
        expect(mockRunTokenCleanup.mock.invocationCallOrder[0]).toBeLessThan(
            mockLogin.mock.invocationCallOrder[0]
        );
    });

    it('runs cleanup before refresh-token access token creation', async () => {
        mockCreateAccessToken.mockResolvedValue('new-access-token');

        const request: RefreshTokenRequestMock = {
            params: {},
            cookies: {
                jwt: 'refresh-token'
            }
        };
        const response = {} as Parameters<typeof getRefreshToken>[1];

        await getRefreshToken(request as GetRefreshTokenRequest, response);

        expect(mockRunTokenCleanup).toHaveBeenCalledTimes(1);
        expect(mockCreateAccessToken).toHaveBeenCalledWith('refresh-token');
        expect(mockRunTokenCleanup.mock.invocationCallOrder[0]).toBeLessThan(
            mockCreateAccessToken.mock.invocationCallOrder[0]
        );
    });

    it('does not run cleanup in refresh flow when refresh token is missing', async () => {
        const request: RefreshTokenRequestMock = {
            params: {},
            cookies: {}
        };
        const response = {} as Parameters<typeof getRefreshToken>[1];

        await getRefreshToken(request as GetRefreshTokenRequest, response);

        expect(mockRunTokenCleanup).not.toHaveBeenCalled();
        expect(mockCreateAccessToken).not.toHaveBeenCalled();
    });
});
