/**
 * Put every variable back as it was read: a value restored, a key that did not exist removed
 * again — including one the body itself created.
 *
 * The distinction is the point: deleting a key that held a value, or leaving an empty string where
 * there was no key, are both a changed environment for whatever reads it next.
 *
 * @param previous - variable name → the value it held, or `undefined` for "no key at all"
 */
const restore = (previous: ReadonlyMap<string, string | undefined>): void => {
    for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
};

/**
 * Run a body with one environment variable set, and put the environment back afterwards.
 *
 * Every config value in this codebase is read lazily, at the point of use, PRECISELY so a test can
 * vary it for one case — see `@infrastructure/runtime/environment`. What that buys is only safe
 * with the restore: a variable left changed leaks into every later case in the file, and the case
 * that fails is not the one that changed it.
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
    overrides: Readonly<Record<string, string>>,
    body: () => Promise<T>
): Promise<T> => {
    const previous = new Map(Object.keys(overrides).map((key) => [key, process.env[key]]));
    for (const [key, value] of Object.entries(overrides)) process.env[key] = value;
    try {
        return await body();
    } finally {
        restore(previous);
    }
};

/**
 * {@link withEnvironment}'s opposite: run a body with these variables UNSET, then put them back.
 *
 * For the case whose subject is a deployment that configured nothing — which `process.env` alone
 * cannot express once `tests/support/setup.ts` has given the whole worker a value, as it does for
 * bank transfer so the `shop` scenario can hold its `order.awaitingTransfer` guarantee.
 *
 * @param keys - the variables to clear for the duration
 * @param body - what to run without them
 */
export const withoutEnvironment = async (
    keys: readonly string[],
    body: () => Promise<void>
): Promise<void> => {
    const previous = new Map(keys.map((key) => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
    try {
        await body();
    } finally {
        restore(previous);
    }
};

/**
 * {@link withoutEnvironment} for a whole FILE: every case starts with `keys` unset, and the
 * worker's own values are back before the next file runs.
 *
 * For a suite whose subject IS the configuration — it drives these variables case by case, so
 * wrapping each one in a body would be noise. Saved rather than merely deleted, for the same
 * reason {@link withoutEnvironment} exists at all: the worker may have been given a value by
 * `tests/support/setup.ts`, and `process.env` is shared by every suite that worker runs.
 *
 * @param keys - the variables this file owns for its duration
 */
export const withoutEnvironmentInThisFile = (keys: readonly string[]): void => {
    const previous = new Map(keys.map((key) => [key, process.env[key]]));

    beforeEach(() => {
        for (const key of keys) delete process.env[key];
    });

    afterEach(() => {
        restore(previous);
    });
};
