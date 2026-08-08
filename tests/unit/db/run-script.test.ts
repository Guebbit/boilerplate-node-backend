/**
 * Script entry-point wrapper.
 *
 * The three behaviours a bare promise chain does not provide: a non-zero exit code, cleanup on
 * the failure path, and a logged reason. The middle one is load-bearing — without it `db:seed`
 * leaves its Mongo and Redis sockets open on a throw, and the process hangs instead of exiting.
 */
import { runScript } from '../../../db/run-script';
import { logger } from '@core/adapters/logger';

// Inline `jest.fn()`s rather than outer consts: `jest.mock` is hoisted above the imports, so a
// factory closing over a `const` would read it before initialisation.
jest.mock('@core/adapters/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

const mockError = jest.mocked(logger.error);
const mockWarn = jest.mocked(logger.warn);

const ORIGINAL_EXIT_CODE = process.exitCode;

afterEach(() => {
    process.exitCode = ORIGINAL_EXIT_CODE;
});

describe('runScript', () => {
    it('runs the body, then the cleanup, and leaves the exit code alone', async () => {
        const order: string[] = [];

        await runScript(
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

        await runScript(() => Promise.reject(new Error('boom')), cleanup);

        expect(cleanup).toHaveBeenCalledTimes(1);
        expect(process.exitCode).toBe(1);
    });

    it('never rejects, so the caller needs no .catch of its own', async () => {
        await expect(
            runScript(
                () => Promise.reject(new Error('boom')),
                () => Promise.resolve()
            )
        ).resolves.toBeUndefined();
    });

    it('does not fail a successful run because cleanup failed', async () => {
        await runScript(
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
            () => Promise.reject(new Error('boom')),
            () => Promise.reject(new Error('and cleanup too'))
        );

        expect(process.exitCode).toBe(1);
        expect(mockError).toHaveBeenCalled();
        expect(mockWarn).toHaveBeenCalled();
    });

    it('reports a non-Error throw without crashing on `.message`', async () => {
        await runScript(
            () => Promise.reject('a bare string'),
            () => Promise.resolve()
        );

        expect(process.exitCode).toBe(1);
        expect(mockError).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'a bare string', stack: undefined })
        );
    });
});
