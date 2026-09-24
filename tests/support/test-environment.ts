/**
 * @module
 * The jest environment every suite runs in: `jest-environment-node`, plus one guarantee — no
 * callback a test file registered outlives that file.
 *
 * Why:   a live callback belongs to the file's VM context, so it keeps the WHOLE context alive —
 *        the app, the models, every module the file loaded.
 * Who:   - `express-rate-limit`'s MemoryStore: an interval per limiter, never stopped.
 *        - prom-client's `collectDefaultMetrics`: a GC `PerformanceObserver`, never disconnected.
 * Cost:  35–80 MB retained per file. Jest's workers hide it (`workerIdleMemoryLimit` recycles
 *        them); Stryker forces `runInBand`, so its dry run grew until the heap limit killed it.
 *
 * See: docs/tools/mutation-testing.md#one-process-per-dry-run
 */

import { PerformanceObserver } from 'node:perf_hooks';
import NodeEnvironment from 'jest-environment-node';

/**
 * Jest's resolved configuration for the file, and the file's path and docblock pragmas — read off
 * the base class rather than imported from `@jest/environment`, which this repo does not declare.
 */
type EnvironmentArguments = ConstructorParameters<typeof NodeEnvironment>;

/**
 * A timer callback, as the environment forwards it — arguments and all.
 */
type TimerCallback = (...args: unknown[]) => void;

/**
 * `setTimeout` or `setInterval`, reduced to the one shape both share.
 */
type StartTimer = (callback: TimerCallback, ms?: number, ...args: unknown[]) => NodeJS.Timeout;

/**
 * Anything Node's `clearTimeout`/`clearInterval` accept: the `Timeout` object, or its primitive id.
 */
type TimerHandle = NodeJS.Timeout | string | number;

/**
 * Wraps a timer starter so every timer it starts is recorded in `pending`.
 *
 * A one-shot timer leaves the set when it fires, so a file that runs thousands of them (the MongoDB
 * driver does) holds only the ones still waiting, not every one it ever started.
 *
 * @param start - the real `setTimeout` or `setInterval`
 * @param pending - the file's still-waiting timers
 * @param oneShot - whether the timer is done once it fires
 * @returns a drop-in replacement for `start`
 */
const tracked =
    (start: StartTimer, pending: Set<NodeJS.Timeout>, oneShot: boolean): StartTimer =>
    (callback, ms, ...args) => {
        const timer = start(
            (...received) => {
                if (oneShot) pending.delete(timer);
                callback(...received);
            },
            ms,
            ...args
        );
        pending.add(timer);
        return timer;
    };

/**
 * Wraps a timer canceller so a cancelled timer stops being tracked.
 *
 * @param cancel - the real `clearTimeout` or `clearInterval`
 * @param pending - the file's still-waiting timers
 * @returns a drop-in replacement for `cancel`
 */
const untracking =
    (cancel: (timer?: TimerHandle) => void, pending: Set<NodeJS.Timeout>) =>
    (timer?: TimerHandle): void => {
        // A numeric or string id cannot be in the set — only `Timeout` objects are ever added.
        if (typeof timer === 'object') pending.delete(timer);
        cancel(timer);
    };

/**
 * Where the `observe` patch records to: the running file's set. A process runs one file at a time —
 * in band, and in each jest worker alike — so one slot is enough.
 */
interface ObserverRegistry {
    /** The running file's observers, or `undefined` between files. */
    current: Set<PerformanceObserver> | undefined;
}

/**
 * The registry's key on the shared prototype. `Symbol.for`, so a second copy of this module — a
 * test importing it through jest's registry — finds the first copy's patch instead of stacking one.
 */
const REGISTRY = Symbol.for('tests/support/test-environment#observers');

/**
 * Narrows whatever sits under {@link REGISTRY} to a registry.
 *
 * @param value - the prototype's property under {@link REGISTRY}
 * @returns whether an earlier copy of this module already installed the patch
 */
const isRegistry = (value: unknown): value is ObserverRegistry =>
    typeof value === 'object' && value !== null && 'current' in value;

/**
 * Patches `PerformanceObserver.prototype.observe` to record into a registry — once per process.
 *
 * `perf_hooks` is a core module: every test file shares this one prototype, unlike the timer
 * globals each file gets its own copy of. The patch only records; `teardown` disconnects.
 * https://nodejs.org/api/perf_hooks.html#observerobserveoptions
 *
 * @returns the process's one registry
 */
const installObserverRegistry = (): ObserverRegistry => {
    const { prototype } = PerformanceObserver;
    const existing: unknown = Reflect.get(prototype, REGISTRY);
    if (isRegistry(existing)) return existing;

    const registry: ObserverRegistry = { current: undefined };
    const { observe } = prototype;
    Object.defineProperty(prototype, REGISTRY, { value: registry });
    prototype.observe = function (
        this: PerformanceObserver,
        ...args: Parameters<PerformanceObserver['observe']>
    ) {
        registry.current?.add(this);
        observe.apply(this, args);
    };

    return registry;
};

/**
 * The process's observer registry.
 */
const observerRegistry = installObserverRegistry();

/**
 * Copies `original`'s own properties onto `wrapper` — above all `util.promisify.custom`, which is how
 * `promisify(setTimeout)` finds Node's promise version instead of wrapping the callback form.
 *
 * @param wrapper - the replacement function
 * @param original - the function it stands in for
 * @returns `wrapper`, now carrying `original`'s properties
 */
const withOwnProperties = <T extends object>(wrapper: T, original: object): T =>
    Object.defineProperties(wrapper, Object.getOwnPropertyDescriptors(original));

/**
 * `jest-environment-node` that clears, at teardown, every timer and performance observer the file
 * left running.
 * https://jestjs.io/docs/configuration#testenvironment-string
 */
export default class TestEnvironment extends NodeEnvironment {
    /**
     * Timers this file started that have neither fired (one-shot) nor been cleared.
     */
    private readonly pending = new Set<NodeJS.Timeout>();

    /**
     * Performance observers this file started — see {@link ObserverRegistry}.
     */
    private readonly observers = new Set<PerformanceObserver>();

    /**
     * Whose set the registry pointed at before this file's — restored at teardown, so an
     * environment built INSIDE a test file hands the slot back to that file.
     */
    private previousObservers: Set<PerformanceObserver> | undefined;

    /**
     * Installs the tracking wrappers on the file's globals, before any module of the file loads.
     *
     * @param config - jest's resolved configuration for this file
     * @param context - the test file's path and docblock pragmas
     */
    constructor(config: EnvironmentArguments[0], context: EnvironmentArguments[1]) {
        super(config, context);

        const { global, pending } = this;
        /*
         * One cast per assignment: the wrappers take the widened `StartTimer` shape, while
         * `typeof setTimeout` is an overload set. The runtime contract — same arguments in, same
         * `Timeout` out — is what `tracked` preserves; `withOwnProperties` keeps the rest.
         */
        global.setTimeout = withOwnProperties(
            tracked(global.setTimeout as StartTimer, pending, true),
            global.setTimeout
        ) as typeof setTimeout;
        global.setInterval = withOwnProperties(
            tracked(global.setInterval as StartTimer, pending, false),
            global.setInterval
        ) as typeof setInterval;
        global.clearTimeout = untracking(global.clearTimeout, pending);
        global.clearInterval = untracking(global.clearInterval, pending);
    }

    /**
     * Points the process-wide observer patch at this file, before the file's first module loads.
     */
    override async setup(): Promise<void> {
        await super.setup();
        this.previousObservers = observerRegistry.current;
        observerRegistry.current = this.observers;
    }

    /**
     * Clears whatever the file left running, then lets `jest-environment-node` release the context.
     */
    override async teardown(): Promise<void> {
        for (const timer of this.pending) clearTimeout(timer);
        this.pending.clear();
        for (const observer of this.observers) observer.disconnect();
        this.observers.clear();
        if (observerRegistry.current === this.observers)
            observerRegistry.current = this.previousObservers;
        await super.teardown();
    }
}
