/**
 * @module
 * The worker recycle limit in the jest configs follows the worker count, because jest runs a
 * one-worker run in band only while the limit is undefined.
 */

import { setProcessEnvironment } from '@tests/environment';

/** The slice of a jest config these cases read. */
interface WorkerSettings {
    maxWorkers: number;
    workerIdleMemoryLimit?: string;
}

/**
 * Loads a jest config fresh with `JEST_WORKERS` set, since the config reads it at require time.
 *
 * @param file the config's path from the repo root
 * @param workers the value to set `JEST_WORKERS` to
 * @returns the config's worker settings
 * @throws {Error} when the config did not load
 */
const loadWith = (file: string, workers: string): WorkerSettings => {
    // Restored after the case by the harness, so nothing leaks into the next file.
    setProcessEnvironment({ JEST_WORKERS: workers });
    let loaded: WorkerSettings | undefined;

    // Isolated so the config's top-level code re-runs against this run's environment.
    jest.isolateModules(() => {
        // The config is plain CommonJS with no types of its own; the shape is what the cases assert.
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- a CJS jest config has no ESM entry.
        loaded = require(`../../../../${file}`) as WorkerSettings;
    });

    if (!loaded) throw new Error(`${file} did not load`);
    return loaded;
};

describe('jest.config.js worker recycle limit', () => {
    it('is set when there are several workers to recycle', () => {
        expect(loadWith('jest.config.js', '3').workerIdleMemoryLimit).toMatch(/MB$/);
    });

    it('is absent for one worker, so jest can pick in band itself', () => {
        expect(loadWith('jest.config.js', '1').workerIdleMemoryLimit).toBeUndefined();
    });

    it('is absent in the mutation config, which narrows the pool to one after spreading the base', () => {
        const mutation = loadWith('jest.config.mutation.js', '3');

        expect(mutation.maxWorkers).toBe(1);
        expect(mutation.workerIdleMemoryLimit).toBeUndefined();
    });
});
