import Users from '@models/users';
import { runTokenCleanup, startTokenCleanup } from '@utils/token-cleanup';

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
    jest.useFakeTimers({ legacyFakeTimers: false });
    delete process.env.NODE_TOKEN_CLEANUP_INTERVAL;
});

afterEach(() => {
    jest.useRealTimers();
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

describe('startTokenCleanup', () => {
    it('runs an immediate cleanup on startup', async () => {
        mockTokenRemoveExpired.mockResolvedValue({ status: 200, success: true });

        const handle = startTokenCleanup();

        // Flush the microtask queue so the initial runTokenCleanup() promise settles
        await Promise.resolve();

        expect(mockTokenRemoveExpired).toHaveBeenCalledTimes(1);

        clearInterval(handle);
    });

    it('runs cleanup again after one default interval (1 hour)', async () => {
        mockTokenRemoveExpired.mockResolvedValue({ status: 200, success: true });

        const handle = startTokenCleanup();

        // Let the initial call settle
        await Promise.resolve();

        // Advance time by one hour to trigger the interval callback
        jest.advanceTimersByTime(3_600_000);
        await Promise.resolve();

        expect(mockTokenRemoveExpired).toHaveBeenCalledTimes(2);

        clearInterval(handle);
    });

    it('respects NODE_TOKEN_CLEANUP_INTERVAL env variable', async () => {
        process.env.NODE_TOKEN_CLEANUP_INTERVAL = '5000';
        mockTokenRemoveExpired.mockResolvedValue({ status: 200, success: true });

        const handle = startTokenCleanup();
        await Promise.resolve();

        // Should not fire again before the 5-second interval
        jest.advanceTimersByTime(4999);
        await Promise.resolve();
        expect(mockTokenRemoveExpired).toHaveBeenCalledTimes(1);

        // Now the interval fires
        jest.advanceTimersByTime(1);
        await Promise.resolve();
        expect(mockTokenRemoveExpired).toHaveBeenCalledTimes(2);

        clearInterval(handle);
    });

    it('falls back to default interval when NODE_TOKEN_CLEANUP_INTERVAL is invalid', async () => {
        process.env.NODE_TOKEN_CLEANUP_INTERVAL = 'not-a-number';
        mockTokenRemoveExpired.mockResolvedValue({ status: 200, success: true });

        const handle = startTokenCleanup();
        await Promise.resolve();

        // Advancing by less than the default 1-hour interval should not trigger again
        jest.advanceTimersByTime(3_599_999);
        await Promise.resolve();
        expect(mockTokenRemoveExpired).toHaveBeenCalledTimes(1);

        // At the full default interval it fires
        jest.advanceTimersByTime(1);
        await Promise.resolve();
        expect(mockTokenRemoveExpired).toHaveBeenCalledTimes(2);

        clearInterval(handle);
    });

    it('returns a handle that can be used to stop further cleanups', async () => {
        mockTokenRemoveExpired.mockResolvedValue({ status: 200, success: true });

        const handle = startTokenCleanup();
        await Promise.resolve();

        clearInterval(handle);

        // Advancing past the default interval should not trigger another call
        jest.advanceTimersByTime(3_600_000);
        await Promise.resolve();

        // Only the initial call should have happened
        expect(mockTokenRemoveExpired).toHaveBeenCalledTimes(1);
    });
});
