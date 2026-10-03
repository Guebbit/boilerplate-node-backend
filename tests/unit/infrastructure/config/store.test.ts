/**
 * `src/infrastructure/config/store.ts` — the process environment with an override layer.
 *
 * The subject is the contract slices rely on: overrides win over the process, hiding one works,
 * and the undo an override hands back restores exactly what was there.
 */
import {
    markEnvironmentOverrides,
    resetEnvironmentOverrides,
    currentEnvironment,
    installEnvironment,
    overrideEnvironment
} from '@infrastructure/config/store';

/** A variable no real environment sets, so every case starts from "absent". */
const NAME = 'NODE_STORE_TEST_VARIABLE';

describe('the environment store', () => {
    // The store's own slot, dropped whole: a mark set by one case must not become the next case's
    // starting point, and a mark has no other way out. The worker's harness mark goes with it, which
    // is harmless here — nothing in this file depends on it.
    afterEach(() => {
        Reflect.deleteProperty(globalThis, Symbol.for('boilerplate-node-backend.config.store'));
    });

    it('lets an override win over the process environment', () => {
        overrideEnvironment({ NODE_ENV: 'production' });

        expect(currentEnvironment().NODE_ENV).toBe('production');
    });

    it('treats an undefined override as "unset", hiding the process value', () => {
        overrideEnvironment({ NODE_ENV: undefined });

        expect('NODE_ENV' in currentEnvironment()).toBe(false);
    });

    it('never writes to process.env', () => {
        overrideEnvironment({ [NAME]: 'x' });

        expect(process.env[NAME]).toBeUndefined();
    });

    describe('the undo an override hands back', () => {
        it('removes an override that was not there before', () => {
            const restore = overrideEnvironment({ [NAME]: 'x' });
            restore();

            expect(NAME in currentEnvironment()).toBe(false);
        });

        it('puts back the override that was there, not the process value', () => {
            overrideEnvironment({ [NAME]: 'outer' });
            const restore = overrideEnvironment({ [NAME]: 'inner' });
            restore();

            expect(currentEnvironment()[NAME]).toBe('outer');
        });

        it('puts back an "unset" override as unset', () => {
            overrideEnvironment({ NODE_ENV: undefined });
            const restore = overrideEnvironment({ NODE_ENV: 'production' });
            restore();

            expect('NODE_ENV' in currentEnvironment()).toBe(false);
        });
    });

    it('resets to the last mark, not to nothing', () => {
        overrideEnvironment({ [NAME]: 'marked' });
        markEnvironmentOverrides();
        overrideEnvironment({ [NAME]: 'changed', NODE_ENV: undefined });

        resetEnvironmentOverrides();

        expect(currentEnvironment()[NAME]).toBe('marked');
        expect(currentEnvironment().NODE_ENV).toBe(process.env.NODE_ENV);
    });

    it('installEnvironment lays overrides that last until a reset removes them', () => {
        installEnvironment({ [NAME]: 'installed' });

        expect(currentEnvironment()[NAME]).toBe('installed');

        resetEnvironmentOverrides();

        expect(NAME in currentEnvironment()).toBe(false);
    });

    it('survives a registry reset: a re-imported store sees the same overrides', () => {
        overrideEnvironment({ [NAME]: 'kept' });
        jest.resetModules();

        return import('@infrastructure/config/store').then((fresh) => {
            expect(fresh.currentEnvironment()[NAME]).toBe('kept');
        });
    });
});
