/**
 * Script entry-point wrapper.
 *
 * The four behaviours a bare promise chain does not provide: a non-zero exit code, cleanup on
 * the failure path, a logged reason, and (D9) an outcome `GET /observability/health` and
 * `job_last_success_timestamp_seconds` can see. The cleanup one is load-bearing — without it
 * `scenario:apply` leaves its Mongo and Redis sockets open on a throw, and the process hangs
 * instead of exiting.
 */
import { runScript } from '../../../scripts/run-script';
import { logger } from '@infrastructure/adapters/logger';
import { recordJobOutcome } from '@infrastructure/persistence/lease';

// Inline `jest.fn()`s rather than outer consts: `jest.mock` is hoisted above the imports, so a
// factory closing over a `const` would read it before initialisation.
jest.mock('@infrastructure/adapters/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('@infrastructure/persistence/lease', () => ({
    recordJobOutcome: jest.fn().mockResolvedValue(undefined)
}));

const mockError = jest.mocked(logger.error);
const mockWarn = jest.mocked(logger.warn);
const mockRecordJobOutcome = jest.mocked(recordJobOutcome);

const ORIGINAL_EXIT_CODE = process.exitCode;

afterEach(() => {
    process.exitCode = ORIGINAL_EXIT_CODE;
    mockRecordJobOutcome.mockClear();
});

describe('runScript', () => {
    it('runs the body, then the cleanup, and leaves the exit code alone', async () => {
        const order: string[] = [];

        await runScript(
            undefined,
            () => {
                order.push('main');
                return Promise.resolve();
            },
            () => {
                order.push('cleanup');
                return Promise.resolve();
            }
        );

        expect(order).toEqual(['main', 'cleanup']);
        expect(process.exitCode).toBe(ORIGINAL_EXIT_CODE);
        expect(mockError).not.toHaveBeenCalled();
    });

    it('sets exit code 1 and logs the reason when the body throws', async () => {
        await runScript(
            undefined,
            () => Promise.reject(new Error('Redis is unreachable')),
            () => Promise.resolve()
        );

        expect(process.exitCode).toBe(1);
        expect(mockError).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'Redis is unreachable' })
        );
    });

    /* The hang: cleanup as the last statement of the happy path is cleanup a throw skips. */
    it('still runs cleanup when the body throws', async () => {
        const cleanup = jest.fn().mockImplementation(() => Promise.resolve());

        await runScript(undefined, () => Promise.reject(new Error('boom')), cleanup);

        expect(cleanup).toHaveBeenCalledTimes(1);
        expect(process.exitCode).toBe(1);
    });

    it('never rejects, so the caller needs no .catch of its own', async () => {
        await expect(
            runScript(
                undefined,
                () => Promise.reject(new Error('boom')),
                () => Promise.resolve()
            )
        ).resolves.toBeUndefined();
    });

    it('does not fail a successful run because cleanup failed', async () => {
        await runScript(
            undefined,
            () => Promise.resolve(),
            () => Promise.reject(new Error('quit on a dead socket'))
        );

        expect(process.exitCode).toBe(ORIGINAL_EXIT_CODE);
        expect(mockWarn).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'quit on a dead socket' })
        );
    });

    it('keeps the failure verdict when both the body and cleanup fail', async () => {
        await runScript(
            undefined,
            () => Promise.reject(new Error('boom')),
            () => Promise.reject(new Error('and cleanup too'))
        );

        expect(process.exitCode).toBe(1);
        // Each failure reported as what it was: the body's as the error, cleanup's as a warning.
        expect(mockError).toHaveBeenCalledWith(expect.objectContaining({ error: 'boom' }));
        expect(mockWarn).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'and cleanup too' })
        );
    });

    it('reports a non-Error throw without crashing on `.message`', async () => {
        await runScript(
            undefined,
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the non-Error rejection IS the case under test
            () => Promise.reject('a bare string'),
            () => Promise.resolve()
        );

        expect(process.exitCode).toBe(1);
        expect(mockError).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'a bare string', stack: undefined })
        );
    });
});

describe('runScript — D9 job-health recording', () => {
    it('records a success against the given name when the body resolves', async () => {
        await runScript(
            'reap:orders',
            () => Promise.resolve(),
            () => Promise.resolve()
        );

        expect(mockRecordJobOutcome).toHaveBeenCalledWith('reap:orders', { failed: false });
    });

    it('records a failure against the given name when the body throws', async () => {
        const error = new Error('boom');

        await runScript(
            'reap:orders',
            () => Promise.reject(error),
            () => Promise.resolve()
        );

        expect(mockRecordJobOutcome).toHaveBeenCalledWith('reap:orders', { failed: true, error });
    });

    it('records nothing when no name is given — a one-off script, not a crontab job', async () => {
        await runScript(
            undefined,
            () => Promise.resolve(),
            () => Promise.resolve()
        );

        expect(mockRecordJobOutcome).not.toHaveBeenCalled();
    });
});
