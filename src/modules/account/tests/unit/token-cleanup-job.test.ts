/**
 * `runTokenCleanup` — the scheduled job that drops expired tokens from every user.
 *
 * ── Why this file is worth reading as an example ─────────────────────────────────────────────
 * The obvious test — call the job, assert the repository method ran — is true in BOTH branches,
 * so writing one per branch produces the same test twice: full line coverage, and a mutation
 * score near zero because nothing observes what the branches do DIFFERENTLY. `if (success)`
 * forced to `true` and forced to `false` both stay green.
 *
 * The logging IS the behaviour here. This job runs unattended on a schedule; nobody watches it
 * succeed. Its entire output is the log line an operator reads afterwards to find out whether
 * tokens are still being cleaned up — so "which line was logged, at which level, saying what" is
 * the contract, not incidental detail. A silent failure here means expired refresh tokens
 * accumulate indefinitely and nobody knows.
 *
 * So every case below asserts on the log, and the two branches are asserted to be mutually
 * exclusive — which is what makes a forced `true`/`false` fail.
 */
import { userModel as Users } from '@modules/users';
import { runTokenCleanup } from '@modules/account/services';
import { logger } from '@infrastructure/adapters/logger';

/*
 * Only `userModel` is replaced. The rest has to stay REAL because this file reaches the job through
 * `@modules/account/services`, and that barrel evaluates every service beside it — `profile.ts`
 * builds its zod schema from `zodUserSchema` at module scope, so a mock that omits it throws before
 * a single test runs. Spreading the actual module keeps the barrel loadable and still lets the one
 * call this job makes be observed.
 */
jest.mock('@modules/users', () => ({
    ...jest.requireActual('@modules/users'),
    __esModule: true,
    userModel: {
        tokenRemoveExpired: jest.fn()
    }
}));

jest.mock('@infrastructure/adapters/logger', () => ({
    __esModule: true,
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn()
    }
}));

const mockTokenRemoveExpired = Users.tokenRemoveExpired as jest.MockedFunction<
    typeof Users.tokenRemoveExpired
>;
const mockedLogger = logger as jest.Mocked<typeof logger>;

/** Every message the job passed to `logger.info`, flattened for substring assertions. */
const infoMessages = () => mockedLogger.info.mock.calls.map(([message]) => String(message));
const errorMessages = () => mockedLogger.error.mock.calls.map(([message]) => String(message));

beforeEach(() => {
    jest.clearAllMocks();
});

describe('runTokenCleanup — the work', () => {
    it('asks the model to remove expired tokens exactly once', async () => {
        mockTokenRemoveExpired.mockResolvedValueOnce({ status: 200, success: true });

        await runTokenCleanup();

        expect(mockTokenRemoveExpired).toHaveBeenCalledTimes(1);
    });

    it('announces that it started, before knowing the outcome', async () => {
        // The start line is what tells an operator the schedule fired at all. Without it, a job
        // that never ran and a job that ran and did nothing look identical in the log.
        mockTokenRemoveExpired.mockResolvedValueOnce({ status: 200, success: true });

        await runTokenCleanup();

        expect(infoMessages()[0]).toContain('starting');
    });
});

describe('runTokenCleanup — the success branch', () => {
    beforeEach(() => {
        mockTokenRemoveExpired.mockResolvedValueOnce({ status: 200, success: true });
    });

    it('logs completion at info level', async () => {
        await runTokenCleanup();

        expect(infoMessages().some((message) => message.includes('completed'))).toBe(true);
    });

    it('logs NOTHING at error level', async () => {
        // Half of what makes the branch condition observable: success must not reach the error
        // path. Without this, `if (success)` forced to `false` still passes.
        await runTokenCleanup();

        expect(mockedLogger.error).not.toHaveBeenCalled();
    });
});

describe('runTokenCleanup — the failure branch', () => {
    beforeEach(() => {
        mockTokenRemoveExpired.mockResolvedValueOnce({ status: 500, success: false });
    });

    it('logs the failure at ERROR level, not info', async () => {
        // Level matters operationally: an alerting rule keys on it. A failure logged at info is
        // a failure nobody is paged for.
        await runTokenCleanup();

        expect(mockedLogger.error).toHaveBeenCalledTimes(1);
    });

    it('includes the status in the failure message, so the log says WHY', async () => {
        // The template literal is the only place the status reaches a human. Emptied out, the
        // operator learns that cleanup failed and nothing else.
        await runTokenCleanup();

        expect(errorMessages()[0]).toContain('500');
    });

    it('does not also claim completion', async () => {
        // The other half of the mutual exclusion: a failure must not log "completed
        // successfully" as well. This is what fails when `if (success)` is forced to `true`.
        await runTokenCleanup();

        expect(infoMessages().some((message) => message.includes('completed'))).toBe(false);
    });
});

describe('runTokenCleanup — the two branches are mutually exclusive', () => {
    // Stated as a table over both outcomes rather than as two more cases: the property is that
    // exactly one of the two log paths is taken, whichever way the model answers.
    it.each([
        [true, 200],
        [false, 500]
    ])('success=%s takes exactly one of the two paths', async (success, status) => {
        mockTokenRemoveExpired.mockResolvedValueOnce({ status, success });

        await runTokenCleanup();

        const completed = infoMessages().filter((message) => message.includes('completed')).length;
        const failed = mockedLogger.error.mock.calls.length;

        expect(completed + failed).toBe(1);
    });
});
