/**
 * `src/worker.ts`, the worker process entry: environment first, tracing next, the worker last.
 *
 * Same reason as `main.test.ts`: the worker pulls in the models and the handlers' own
 * dependencies, which OTel must patch, so it loads after `startTracing()`. The test records the
 * order the entry touches its collaborators in, then what it does with the worker it built.
 */
/** The collaborators the entry touched, in the order it touched them. */
const loaded: string[] = [];

/** The built worker's teardown, which the entry hands to the signal handlers. */
const stop = jest.fn(() => Promise.resolve());

/** The built worker's start, which the entry calls last. */
const start = jest.fn((): Promise<unknown> => Promise.resolve({}));

/** The lifecycle's signal wiring, recorded rather than installed. */
const registerSignalHandlers = jest.fn();

/** The lifecycle's boot-failure exit, recorded rather than run. */
const failBoot = jest.fn(() => Promise.resolve());

jest.mock('@infrastructure/runtime/otel-sdk', () => ({
    startTracing: () => loaded.push('tracing')
}));
jest.mock('@infrastructure/runtime/mongoose-boot', () => {
    loaded.push('mongoose-boot');
    return {};
});
jest.mock('../../../src/infrastructure/config/dotenv', () => {
    loaded.push('dotenv');
    return {};
});
jest.mock('../../../src/app/development-doubles', () => ({
    loadDevelopmentDoubles: () => {
        loaded.push('development-doubles');
        return Promise.resolve();
    }
}));
jest.mock('@app/worker-process', () => {
    loaded.push('worker-process');
    return { createWorker: () => ({ start, stop }) };
});
jest.mock('@infrastructure/runtime/server-lifecycle', () => ({ registerSignalHandlers, failBoot }));

/** Lets the entry's dynamic imports settle. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('src/worker.ts', () => {
    it('loads the environment, starts tracing and the doubles, then builds and starts the worker', async () => {
        await import('../../../src/worker');
        await settle();

        expect(loaded).toEqual([
            'dotenv',
            'mongoose-boot',
            'tracing',
            'development-doubles',
            'worker-process'
        ]);
        expect(registerSignalHandlers).toHaveBeenCalledWith(stop);
        expect(start).toHaveBeenCalledTimes(1);
        expect(failBoot).not.toHaveBeenCalled();
    });

    it('tears down and exits when the worker fails to start', async () => {
        const failure = new Error('broker auth refused');
        start.mockRejectedValueOnce(failure);
        // The entry runs on import: a fresh module registry runs it a second time.
        jest.resetModules();
        await import('../../../src/worker');
        await settle();

        expect(failBoot).toHaveBeenCalledWith(failure, stop);
    });
});
