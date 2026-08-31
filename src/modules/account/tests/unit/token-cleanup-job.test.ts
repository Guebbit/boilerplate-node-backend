/**
 * @module
 * `runTokenCleanup` — the scheduled job that drops expired tokens from every user.
 *
 * The obvious test — call the job, assert the repository method ran — passes in both branches, so
 * it produces near-zero mutation coverage. The logging IS the behaviour here: this job runs
 * unattended, and its log line is the only way an operator learns whether cleanup is still
 * working. So every case asserts on the log, and the two branches are asserted mutually exclusive
 * — which is what a forced `true`/`false` mutant fails.
 */

import { userRepository } from '@modules/users';
import { runTokenCleanup, accountService } from '@modules/account/services';
import { logger } from '@infrastructure/adapters/logger';
import { testCallerContext } from '@tests/caller-context';
import * as auditPort from '@infrastructure/observability/audit';
import { accountAuditActions } from '../../audit';

/*
 * Only `userRepository` is replaced. The rest has to stay REAL because this file reaches the job
 * through `@modules/account/services`, and that barrel evaluates every service beside it —
 * `profile.ts` builds its zod schema from `zodUserSchema` at module scope, so a mock that omits it
 * throws before a single test runs. Spreading the actual module keeps the barrel loadable and
 * still lets the one call this job makes be observed.
 *
 * The sweep used to be a `static` on `userModel` that resolved `{ status, success }`; it is now a
 * repository method that resolves a COUNT or rejects, which is why the branches below are
 * resolve-vs-reject rather than two shapes of the same resolution.
 */
jest.mock('@modules/users', () => ({
    ...jest.requireActual('@modules/users'),
    __esModule: true,
    userRepository: {
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

/*
 * `emitAuditEvent` is replaced too, rather than reached with `jest.spyOn(auditPort, ...)` on the
 * namespace import below. TypeScript's CommonJS `__importStar` interop copies a namespace import's
 * properties as non-configurable getters, which `jest.spyOn` cannot redefine — a mismatch some
 * transpile paths mask and some (Stryker's instrumented sandbox, at minimum) do not. Mocking the
 * module gives every consumer a plain, always-configurable `jest.fn()` instead.
 */
jest.mock('@infrastructure/observability/audit', () => ({
    __esModule: true,
    ...jest.requireActual('@infrastructure/observability/audit'),
    emitAuditEvent: jest.fn()
}));

const mockTokenRemoveExpired = userRepository.tokenRemoveExpired as jest.MockedFunction<
    typeof userRepository.tokenRemoveExpired
>;
const mockedLogger = logger as jest.Mocked<typeof logger>;

/** Every message the job passed to `logger.info`, flattened for substring assertions. */
const infoMessages = () =>
    mockedLogger.info.mock.calls.map(([message]) =>
        typeof message === 'string' ? message : JSON.stringify(message)
    );
const errorMessages = () =>
    mockedLogger.error.mock.calls.map(([message]) =>
        typeof message === 'string' ? message : JSON.stringify(message)
    );

beforeEach(() => {
    jest.clearAllMocks();
});

describe('runTokenCleanup — the work', () => {
    it('asks the repository to remove expired tokens exactly once', async () => {
        mockTokenRemoveExpired.mockResolvedValueOnce(3);

        await runTokenCleanup();

        expect(mockTokenRemoveExpired).toHaveBeenCalledTimes(1);
    });

    it('announces that it started, before knowing the outcome', async () => {
        // The start line is what tells an operator the schedule fired at all. Without it, a job
        // that never ran and a job that ran and did nothing look identical in the log.
        mockTokenRemoveExpired.mockResolvedValueOnce(3);

        await runTokenCleanup();

        expect(infoMessages()[0]).toContain('starting');
    });
});

describe('runTokenCleanup — the success branch', () => {
    beforeEach(() => {
        mockTokenRemoveExpired.mockResolvedValueOnce(3);
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
        mockTokenRemoveExpired.mockRejectedValueOnce(new Error('db failure'));
    });

    it('logs the failure at ERROR level, not info', async () => {
        // Level matters operationally: an alerting rule keys on it. A failure logged at info is
        // a failure nobody is paged for.
        await runTokenCleanup();

        expect(mockedLogger.error).toHaveBeenCalledTimes(1);
    });

    it('carries the cause into the failure message, so the log says WHY', async () => {
        // The error is the only place the reason reaches a human. Dropped, the operator learns
        // that cleanup failed and nothing else — and this job runs unwatched.
        await runTokenCleanup();

        expect(errorMessages()[0]).toContain('db failure');
    });

    it('does not let the sweep fail whatever triggered it', async () => {
        // Login and refresh run this as a pre-flight step. A rejection escaping here would turn a
        // valid sign-in into a 500 because housekeeping had a bad moment.
        await expect(runTokenCleanup()).resolves.toBeUndefined();
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
    it.each([[true], [false]])('succeeded=%s takes exactly one of the two paths', async (ok) => {
        if (ok) mockTokenRemoveExpired.mockResolvedValueOnce(3);
        else mockTokenRemoveExpired.mockRejectedValueOnce(new Error('db failure'));

        await runTokenCleanup();

        const completed = infoMessages().filter((message) => message.includes('completed')).length;
        const failed = mockedLogger.error.mock.calls.length;

        expect(completed + failed).toBe(1);
    });
});

describe('adminTokenCleanup — the admin-triggered, audited counterpart', () => {
    const mockedEmitAuditEvent = auditPort.emitAuditEvent as jest.MockedFunction<
        typeof auditPort.emitAuditEvent
    >;

    it('audits a successful cleanup', async () => {
        mockTokenRemoveExpired.mockResolvedValueOnce(2);

        const result = await accountService.adminTokenCleanup(testCallerContext);

        expect(result).toEqual(expect.objectContaining({ success: true, data: { removed: 2 } }));
        expect(mockedEmitAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accountAuditActions.AUTH_TOKEN_EXPIRED_CLEANUP,
                outcome: 'success'
            })
        );
    });

    it('does not audit a failed cleanup — nothing to report happened', async () => {
        mockTokenRemoveExpired.mockRejectedValueOnce(new Error('db failure'));

        const result = await accountService.adminTokenCleanup(testCallerContext);

        // The 500 is chosen HERE, by the service, rather than replayed from a number a Mongoose
        // static invented — see `services/token-cleanup.ts`.
        expect(result).toEqual(expect.objectContaining({ success: false, status: 500 }));
        expect(mockedEmitAuditEvent).not.toHaveBeenCalled();
    });
});
