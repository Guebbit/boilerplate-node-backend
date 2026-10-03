import {
    resetEnvironmentOverrides,
    overrideEnvironment,
    type EnvironmentOverrides
} from '@infrastructure/config/store';

/**
 * An override set that unsets every one of `keys`.
 *
 * @param keys - the variables to hide
 */
const unset = (keys: readonly string[]): Record<string, undefined> =>
    Object.fromEntries(keys.map((key) => [key, undefined]));

/**
 * Run a body with one environment variable set, and put the environment back afterwards.
 *
 * Overrides go to the config store's override layer, never to `process.env`: the store reads the
 * process environment once, so only an override can change what a slice sees. They pass through
 * the real parser. The restore matters: an override left in place leaks into every later case in
 * the file, and the case that fails is not the one that changed it.
 *
 * @param key - the variable to set
 * @param value - what to set it to
 * @param body - what to run with it set
 */
export const withEnvironment = (
    key: string,
    value: string,
    body: () => Promise<void>
): Promise<void> => withEnvironmentOverrides({ [key]: value }, body);

/**
 * {@link withEnvironment} for several variables at once, returning what `body` resolves to — the
 * shape a module reload needs: a limiter's budget is captured at import time, so the caller runs
 * `jest.resetModules()` and a fresh `import()` inside `body`, and gets the new instance back.
 * Restores every override whether `body` resolved or threw, unlike a plain "set, await, restore"
 * sequence would.
 *
 * @param overrides - variable name → value, for the duration of `body`
 * @param body - what to run with them set; its resolved value passes through
 */
export const withEnvironmentOverrides = async <T>(
    overrides: EnvironmentOverrides,
    body: () => Promise<T>
): Promise<T> => {
    const restore = overrideEnvironment(overrides);
    // `finally` rather than a chain: the restore must run whether `body` resolved, rejected or threw.
    try {
        return await body();
    } finally {
        restore();
    }
};

/**
 * {@link withEnvironment}'s opposite: run a body with these variables UNSET, then put them back.
 *
 * For the case whose subject is a deployment that configured nothing — which the worker's own
 * environment cannot express once `tests/support/setup-environment.ts` has given the whole worker a value, as it does for
 * bank transfer so the `shop` scenario can hold its `order.awaitingTransfer` guarantee.
 *
 * @param keys - the variables to clear for the duration
 * @param body - what to run without them
 */
export const withoutEnvironment = async (
    keys: readonly string[],
    body: () => Promise<void>
): Promise<void> => {
    const restore = overrideEnvironment(unset(keys));
    try {
        await body();
    } finally {
        restore();
    }
};

/**
 * {@link withoutEnvironment} for a whole FILE: every case starts with `keys` unset, and the
 * worker's own values are back before the next file runs.
 *
 * For a suite whose subject IS the configuration — it drives these variables case by case, so
 * wrapping each one in a body would be noise. Unset as an override rather than deleted from
 * `process.env`: the store has already read the process environment, and the worker may have been
 * given a value by `tests/support/setup-environment.ts`.
 *
 * @param keys - the variables this file owns for its duration
 */
export const withoutEnvironmentInThisFile = (keys: readonly string[]): void => {
    let restore: (() => void) | undefined;

    beforeEach(() => {
        restore = overrideEnvironment(unset(keys));
    });

    afterEach(() => {
        restore?.();
        restore = undefined;
    });
};

/**
 * Override variables for the rest of the case — or the file — whichever the caller's own cleanup
 * ends. `undefined` unsets one. Pair it with {@link resetEnvironment} in an `afterEach`.
 *
 * For a test that varies a setting across several statements, where {@link withEnvironment}'s
 * body would only add indentation. Passes through the real parser, like every override.
 *
 * @param overrides - variable name → value, or `undefined` to unset
 */
export const setEnvironment = (overrides: EnvironmentOverrides): void => {
    overrideEnvironment(overrides);
};

/**
 * Drop every override this file made, so each variable reads as the worker started it: the
 * defaults from `tests/support/setup-environment.ts` and whatever the real environment held.
 */
export const resetEnvironment = (): void => {
    resetEnvironmentOverrides();
};

/** What `process.env` held for each variable {@link setProcessEnvironment} touched, first touch wins. */
const processOriginals = new Map<string, string | undefined>();

/**
 * Write the REAL `process.env`, for a subject that reads it directly: a script under `scripts/`,
 * or a library such as mongodb-memory-server. The config store never sees these.
 *
 * Put back after every case by `setup-environment-reset.ts`, which calls
 * {@link restoreProcessEnvironment}. `undefined` removes the variable.
 *
 * @param overrides - variable name → value, or `undefined` to remove it
 */
export const setProcessEnvironment = (overrides: EnvironmentOverrides): void => {
    for (const [name, value] of Object.entries(overrides)) {
        if (!processOriginals.has(name)) processOriginals.set(name, process.env[name]);
        if (value === undefined) Reflect.deleteProperty(process.env, name);
        else process.env[name] = value;
    }
};

/**
 * Undo every {@link setProcessEnvironment}: a value restored, a variable that did not exist
 * removed again. "Removed" and "empty" differ to whatever reads it next.
 */
export const restoreProcessEnvironment = (): void => {
    for (const [name, value] of processOriginals) {
        if (value === undefined) Reflect.deleteProperty(process.env, name);
        else process.env[name] = value;
    }
    processOriginals.clear();
};
