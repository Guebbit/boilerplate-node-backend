/**
 * Script entry-point wrapper.
 *
 * The four behaviours a bare promise chain does not provide: a non-zero exit code, cleanup on
 * the failure path, a logged reason, and an outcome `GET /observability/health` and
 * `job_last_success_timestamp_seconds` can see. The cleanup one is load-bearing — without it
 * `scenario:apply` leaves its Mongo and Redis sockets open on a throw, and the process hangs
 * instead of exiting.
 */
import { runScript } from '../../../scripts/run-script';
import { logger } from '@infrastructure/adapters/logger';
import { recordJobOutcome } from '@infrastructure/persistence/lease';
import { assertProcessConfig } from '@app/config';
import { loadDevelopmentDoubles } from '@app/development-doubles';

/**
 * Inline `jest.fn()`s rather than outer consts: `jest.mock` is hoisted above the imports, so a
 * factory closing over a `const` would read it before initialisation.
 */
jest.mock('@infrastructure/adapters/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('@infrastructure/persistence/lease', () => ({
    recordJobOutcome: jest.fn().mockResolvedValue(undefined)
}));
/**
 * The real gate loads every module; what is under test here is only what runScript does with its
 * verdict. The gate itself is `tests/unit/app/config.test.ts`'s and `tests/unit/kernel/`'s.
 */
jest.mock('@app/config', () => ({ assertProcessConfig: jest.fn() }));
// What the loader does is `tests/unit/app/development-doubles.test.ts`'s; here only when it runs.
jest.mock('@app/development-doubles', () => ({ loadDevelopmentDoubles: jest.fn() }));

/** Stands in for the logger's error. */
const mockError = jest.mocked(logger.error);
/** Stands in for the logger's warn. */
const mockWarn = jest.mocked(logger.warn);
/** Stands in for recording the job outcome. */
const mockRecordJobOutcome = jest.mocked(recordJobOutcome);
/** Stands in for the process config check. */
const mockAssertProcessConfig = jest.mocked(assertProcessConfig);
/** Stands in for loading the development doubles. */
const mockLoadDevelopmentDoubles = jest.mocked(loadDevelopmentDoubles);

/** The exit code as the runner set it, restored after each case. */
const ORIGINAL_EXIT_CODE = process.exitCode;

beforeEach(() => {
    mockLoadDevelopmentDoubles.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
    process.exitCode = ORIGINAL_EXIT_CODE;
    mockRecordJobOutcome.mockClear();
    mockAssertProcessConfig.mockReset();
});

/** The verdict the gate gives: a typo'd variable. */
const refuse = (): void => {
    mockAssertProcessConfig.mockImplementation(() => {
        throw new Error('Refusing to boot: invalid values — NODE_PORT: expected whole number');
    });
};

describe('runScript on an invalid environment', () => {
    it('never runs the body, says why, and exits non-zero', async () => {
        refuse();
        const main = jest.fn().mockResolvedValue(undefined);

        await runScript('reap:orders', main, () => Promise.resolve());

        expect(main).not.toHaveBeenCalled();
        expect(process.exitCode).toBe(1);
        expect(mockError).toHaveBeenCalledWith(
            expect.objectContaining({ error: expect.stringContaining('NODE_PORT') as string })
        );
    });

    it('still closes what the caller opened', async () => {
        refuse();
        const cleanup = jest.fn().mockResolvedValue(undefined);

        await runScript(undefined, () => Promise.resolve(), cleanup);

        expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('records no job outcome: the job never ran, and recording one needs the database', async () => {
        refuse();

        await runScript(
            'reap:orders',
            () => Promise.resolve(),
            () => Promise.resolve()
        );

        expect(mockRecordJobOutcome).not.toHaveBeenCalled();
    });

    it('does not let a failing cleanup reject', async () => {
        refuse();

        await expect(
            runScript(
                undefined,
                () => Promise.resolve(),
                () => Promise.reject(new Error('quit failed'))
            )
        ).resolves.toBeUndefined();
    });
});

describe('runScript and the development doubles', () => {
    it('loads them before the config gate judges the environment', async () => {
        const order: string[] = [];
        mockLoadDevelopmentDoubles.mockImplementation(() => {
            order.push('development-doubles');
            return Promise.resolve();
        });
        mockAssertProcessConfig.mockImplementation(() => {
            order.push('gate');
        });

        await runScript(
            undefined,
            () => {
                order.push('main');
                return Promise.resolve();
            },
            () => Promise.resolve()
        );

        expect(order).toEqual(['development-doubles', 'gate', 'main']);
    });

    it('refuses to run when they cannot load: says why, exits non-zero, still cleans up, no outcome', async () => {
        mockLoadDevelopmentDoubles.mockRejectedValue(
            new Error('NODE_ENV=development, but this image has no `scenarios/`')
        );
        const main = jest.fn().mockResolvedValue(undefined);
        const cleanup = jest.fn().mockResolvedValue(undefined);

        await runScript('reap:orders', main, cleanup);

        expect(main).not.toHaveBeenCalled();
        expect(mockAssertProcessConfig).not.toHaveBeenCalled();
        expect(process.exitCode).toBe(1);
        expect(mockError).toHaveBeenCalledWith(
            expect.objectContaining({ error: expect.stringContaining('no `scenarios/`') as string })
        );
        expect(cleanup).toHaveBeenCalledTimes(1);
        expect(mockRecordJobOutcome).not.toHaveBeenCalled();
    });
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

describe('runScript — job-health recording', () => {
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

describe('runScript on an invalid environment with a failing cleanup', () => {
    it('logs the cleanup failure as a warning instead of swallowing it', async () => {
        refuse();
        mockWarn.mockClear();

        await runScript(
            undefined,
            () => Promise.resolve(),
            () => Promise.reject(new Error('quit failed'))
        );

        expect(mockWarn).toHaveBeenCalledWith(expect.objectContaining({ error: 'quit failed' }));
    });
});
