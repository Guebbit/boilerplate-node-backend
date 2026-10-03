/**
 * `src/infrastructure/config/store.ts` — the environment, read once, with an override layer.
 *
 * The subject is the contract slices rely on: a snapshot that never moves, overrides that win and
 * come back out exactly, and a version that moves only when what a read returns could differ.
 */
import {
    currentEnvironment,
    environmentVersion,
    installEnvironment,
    markEnvironmentOverrides,
    overrideEnvironment,
    refreshEnvironment,
    resetEnvironmentOverrides
} from '@infrastructure/config/store';
import { setProcessEnvironment } from '@tests/environment';

/** A variable no real environment sets, so every case starts from "absent". */
const NAME = 'NODE_STORE_TEST_VARIABLE';

describe('the environment store', () => {
    // The store's own slot, dropped whole: a mark set by one case must not become the next case's
    // starting point, and a mark has no other way out. The worker's harness mark goes with it, which
    // is harmless here — nothing in this file depends on it.
    afterEach(() => {
        Reflect.deleteProperty(globalThis, Symbol.for('boilerplate-node-backend.config.store'));
    });

    it('reads process.env once: a later write is not seen', () => {
        currentEnvironment();

        setProcessEnvironment({ [NAME]: 'late' });

        expect(currentEnvironment()[NAME]).toBeUndefined();
    });

    it('sees a write made before the first read', () => {
        setProcessEnvironment({ [NAME]: 'early' });

        expect(currentEnvironment()[NAME]).toBe('early');
    });

    it('takes the snapshot again on refresh, and only then', () => {
        currentEnvironment();
        setProcessEnvironment({ [NAME]: 'loaded' });

        refreshEnvironment();

        expect(currentEnvironment()[NAME]).toBe('loaded');
    });

    it('returns the same object until something changes', () => {
        const first = currentEnvironment();

        expect(currentEnvironment()).toBe(first);

        overrideEnvironment({ [NAME]: 'x' });

        expect(currentEnvironment()).not.toBe(first);
    });

    it('is frozen', () => {
        expect(Object.isFrozen(currentEnvironment())).toBe(true);
    });

    it('lets an override win over the snapshot', () => {
        overrideEnvironment({ NODE_ENV: 'production' });

        expect(currentEnvironment().NODE_ENV).toBe('production');
    });

    it('treats an undefined override as "unset", hiding the snapshot value', () => {
        overrideEnvironment({ NODE_ENV: undefined });

        expect('NODE_ENV' in currentEnvironment()).toBe(false);
    });

    it('never writes to process.env', () => {
        overrideEnvironment({ [NAME]: 'x' });

        expect(process.env[NAME]).toBeUndefined();
    });

    it('moves the version on every change, and on nothing else', () => {
        const before = environmentVersion();
        currentEnvironment();

        expect(environmentVersion()).toBe(before);

        const restore = overrideEnvironment({ [NAME]: 'x' });
        const afterOverride = environmentVersion();

        expect(afterOverride).toBeGreaterThan(before);

        restore();

        expect(environmentVersion()).toBeGreaterThan(afterOverride);
    });

    describe('the undo an override hands back', () => {
        it('removes an override that was not there before', () => {
            const restore = overrideEnvironment({ [NAME]: 'x' });
            restore();

            expect(NAME in currentEnvironment()).toBe(false);
        });

        it('puts back the override that was there, not the snapshot', () => {
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

    it('survives a registry reset: a re-imported store sees the same state', () => {
        overrideEnvironment({ [NAME]: 'kept' });
        jest.resetModules();

        return import('@infrastructure/config/store').then((fresh) => {
            expect(fresh.currentEnvironment()[NAME]).toBe('kept');
        });
    });
});
