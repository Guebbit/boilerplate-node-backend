import Users from '@models/users';
import { runTokenCleanup } from '@utils/token-cleanup';

jest.mock('@models/users', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    default: {
        tokenRemoveExpired: jest.fn()
    }
}));

jest.mock('@utils/winston', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    default: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn()
    }
}));

const mockTokenRemoveExpired = Users.tokenRemoveExpired as jest.MockedFunction<
    typeof Users.tokenRemoveExpired
>;

beforeEach(() => {
    jest.clearAllMocks();
});

describe('runTokenCleanup', () => {
    it('calls Users.tokenRemoveExpired and logs success', async () => {
        mockTokenRemoveExpired.mockResolvedValueOnce({ status: 200, success: true });

        await runTokenCleanup();

        expect(mockTokenRemoveExpired).toHaveBeenCalledTimes(1);
    });

    it('logs an error message when tokenRemoveExpired reports failure', async () => {
        mockTokenRemoveExpired.mockResolvedValueOnce({ status: 500, success: false });

        await runTokenCleanup();

        expect(mockTokenRemoveExpired).toHaveBeenCalledTimes(1);
    });
});
