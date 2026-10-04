/**
 * @module
 * The two token sweeps: `reapExpiredTokens` (the nightly whole-collection job) and
 * `pruneOwnExpiredTokens` (what a login and a refresh run on THEIR account). The obvious test —
 * call it, assert the model method ran — passes in both branches, so the cases assert what makes
 * each one safe: the retention window handed to the model, the scope (everyone, or one account),
 * and that the contained one never fails the request that triggered it.
 */

import { userService } from '@modules/users';
import { reapExpiredTokens, pruneOwnExpiredTokens } from '@modules/account/services';
import { getReuseDetectionWindowMilliseconds } from '@modules/account/session/config';
import { logger } from '@infrastructure/adapters/logger';

/*
 * Only `userService.tokenRemoveExpired` is replaced. The rest of `userService` stays REAL, same as
 * the rest of `@modules/users`: this file reaches the sweeps through `@modules/account/services`,
 * and that barrel evaluates every sibling service at load time — `profile.ts` builds its zod
 * schema from `zodUserSchema` at module scope, so a mock omitting it throws before a single test
 * runs. Spreading both the actual module and the actual `userService` keeps the barrel loadable.
 */
jest.mock('@modules/users', () => {
    const actual = jest.requireActual<typeof import('@modules/users')>('@modules/users');
    return {
        ...actual,
        __esModule: true,
        userService: {
            ...actual.userService,
            tokenRemoveExpired: jest.fn()
        }
    };
});

jest.mock('@infrastructure/adapters/logger', () => ({
    __esModule: true,
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn()
    }
}));

const mockTokenRemoveExpired = userService.tokenRemoveExpired as jest.MockedFunction<
    typeof userService.tokenRemoveExpired
>;
const mockedLogger = logger as jest.Mocked<typeof logger>;

beforeEach(() => {
    jest.clearAllMocks();
});

describe('reapExpiredTokens — the nightly sweep', () => {
    it('sweeps every account, on the reuse-detection window, and reports how many it pruned', async () => {
        mockTokenRemoveExpired.mockResolvedValueOnce(3);

        const pruned = await reapExpiredTokens();

        // No second argument: no account named means every account. The window is the
        // REUSE-DETECTION one, never the shorter rotation grace window (see the service's doc).
        expect(mockTokenRemoveExpired).toHaveBeenCalledWith(getReuseDetectionWindowMilliseconds());
        expect(pruned).toBe(3);
    });

    it('lets a failure reach the job, whose runner records it', async () => {
        mockTokenRemoveExpired.mockRejectedValueOnce(new Error('db failure'));

        await expect(reapExpiredTokens()).rejects.toThrow('db failure');
    });
});

describe('pruneOwnExpiredTokens — a login and a refresh pruning their own account', () => {
    it('prunes ONE account, on the same reuse-detection window as the nightly sweep', async () => {
        mockTokenRemoveExpired.mockResolvedValueOnce(1);

        await pruneOwnExpiredTokens('account-1');

        expect(mockTokenRemoveExpired).toHaveBeenCalledTimes(1);
        expect(mockTokenRemoveExpired).toHaveBeenCalledWith(
            getReuseDetectionWindowMilliseconds(),
            'account-1'
        );
    });

    it('logs nothing at error level when it works', async () => {
        mockTokenRemoveExpired.mockResolvedValueOnce(0);

        await pruneOwnExpiredTokens('account-1');

        expect(mockedLogger.error).not.toHaveBeenCalled();
    });

    describe('when the prune fails', () => {
        /** The rejection injected — held by name so an assertion can point at it. */
        const FAILURE = new Error('db failure');

        beforeEach(() => {
            mockTokenRemoveExpired.mockRejectedValueOnce(FAILURE);
        });

        // A login or a refresh runs this as housekeeping. A rejection escaping would turn a valid
        // sign-in into a 500 because housekeeping had a bad moment.
        it('does not let the failure reach the request that triggered it', async () => {
            await expect(pruneOwnExpiredTokens('account-1')).resolves.toBeUndefined();
        });

        // Level matters operationally (an alert keys on it), and the cause is the only place the
        // reason reaches a human. The raw Error is passed: `redactFormat` serialises it, whereas
        // `JSON.stringify` of an Error is `{}`.
        it('logs it at ERROR level with the cause and the account', async () => {
            await pruneOwnExpiredTokens('account-1');

            expect(mockedLogger.error).toHaveBeenCalledTimes(1);
            expect(mockedLogger.error).toHaveBeenCalledWith(
                expect.objectContaining({ error: FAILURE, userId: 'account-1' })
            );
        });
    });
});
