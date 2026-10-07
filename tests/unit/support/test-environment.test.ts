/**
 * @module
 * The jest environment — `tests/support/test-environment.ts`.
 *
 * Its main promise is that nothing a test file registered keeps running after the file ends, since a
 * live callback pins the file's whole VM context in memory. Each case builds a real environment,
 * starts something through it, tears it down, and checks the callback never runs again. The last
 * cases check the other promises: Stryker's records leave the file's realm, and a collection runs
 * at teardown when `--expose-gc` provides one.
 */

import { PerformanceObserver, performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { runInNewContext } from 'node:vm';
import TestEnvironment from '@tests/test-environment';
import { asStub } from '@tests/stub';

/** The two arguments jest hands an environment's constructor. */
type EnvironmentArguments = ConstructorParameters<typeof TestEnvironment>;

/** Long enough for a 1 ms timer to fire several times over, short enough to keep the suite fast. */
const SETTLE_MS = 40;

/**
 * A real environment, with only the configuration `jest-environment-node` actually reads.
 *
 * @returns an environment that has been set up, ready to start timers through
 */
const createEnvironment = async (): Promise<TestEnvironment> => {
    const environment = new TestEnvironment(
        asStub<EnvironmentArguments[0]>({
            projectConfig: { testEnvironmentOptions: {}, globals: {}, fakeTimers: {} },
            globalConfig: {}
        }),
        asStub<EnvironmentArguments[1]>({ testPath: __filename, docblockPragmas: {}, console })
    );
    await environment.setup();
    return environment;
};

/**
 * Waits on the REAL clock — not the environment's — so the wait itself is never swept.
 *
 * @param ms - how long to wait
 */
const settle = (ms = SETTLE_MS) => new Promise((resolve) => setTimeout(resolve, ms));

describe('TestEnvironment', () => {
    it('stops an interval the file never cleared', async () => {
        const environment = await createEnvironment();
        let ticks = 0;
        environment.global.setInterval(() => ticks++, 1);

        await settle();
        await environment.teardown();
        const atTeardown = ticks;
        await settle();

        expect(atTeardown).toBeGreaterThan(0);
        expect(ticks).toBe(atTeardown);
    });

    it('cancels a timeout still waiting when the file ends', async () => {
        const environment = await createEnvironment();
        let fired = false;
        environment.global.setTimeout(() => {
            fired = true;
        }, SETTLE_MS / 2);

        await environment.teardown();
        await settle();

        expect(fired).toBe(false);
    });

    it('leaves the file’s own timers working, arguments and clearing included', async () => {
        const environment = await createEnvironment();
        const received: unknown[] = [];
        environment.global.setTimeout((value: unknown) => received.push(value), 1, 'argument');
        const cleared = environment.global.setTimeout(() => received.push('cleared'), 1);
        environment.global.clearTimeout(cleared);

        await settle();
        await environment.teardown();

        expect(received).toEqual(['argument']);
    });

    it('keeps promisify(setTimeout) resolving to its value', async () => {
        const environment = await createEnvironment();

        await expect(promisify(environment.global.setTimeout)(1, 'value')).resolves.toBe('value');
        await environment.teardown();
    });

    it('disconnects a performance observer the file never disconnected', async () => {
        const environment = await createEnvironment();
        const seen: string[] = [];
        new PerformanceObserver((list) => {
            seen.push(...list.getEntries().map((entry) => entry.name));
        }).observe({ entryTypes: ['mark'] });

        performance.mark('before-teardown');
        await settle();
        await environment.teardown();
        performance.mark('after-teardown');
        await settle();

        expect(seen).toEqual(['before-teardown']);
    });

    it('moves Stryker’s coverage records out of the finished file’s realm, values intact', async () => {
        const environment = await createEnvironment();
        // `runInNewContext` builds the records the way instrumented code does: inside another realm.
        const coverage: unknown = runInNewContext(
            '({ static: { 1: 2 }, perTest: { a: { 3: 4 } } })'
        );
        const namespace = { mutantCoverage: coverage };
        Reflect.set(environment.global, '__stryker__', namespace);

        await environment.teardown();

        expect(namespace.mutantCoverage).toEqual({ static: { 1: 2 }, perTest: { a: { 3: 4 } } });
        expect(namespace.mutantCoverage).not.toBe(coverage);
        // The `toEqual` above just proved this shape.
        const moved = namespace.mutantCoverage as { static: object; perTest: { a: object } };
        expect(Object.getPrototypeOf(moved.static)).toBe(Object.prototype);
        expect(Object.getPrototypeOf(moved.perTest.a)).toBe(Object.prototype);
    });

    it('keeps a coverage record already in this realm, and honours a renamed namespace', async () => {
        const environment = await createEnvironment();
        const hits = { 3: 4 };
        const namespace = { mutantCoverage: { static: {}, perTest: { a: hits } } };
        Reflect.set(environment.global, '__strykerGlobalNamespace__', '__renamed__');
        Reflect.set(environment.global, '__renamed__', namespace);

        await environment.teardown();

        expect(namespace.mutantCoverage.perTest.a).toBe(hits);
    });

    it('collects garbage once the file ends, when --expose-gc made that possible', async () => {
        const collect = jest.fn();
        const original = globalThis.gc;
        globalThis.gc = collect;
        const environment = await createEnvironment();

        await environment.teardown();
        globalThis.gc = original;

        expect(collect).toHaveBeenCalledTimes(1);
    });
});
