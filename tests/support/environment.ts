/**
 * Run a body with one environment variable set, and put the environment back afterwards.
 *
 * Every config value in this codebase is read lazily, at the point of use, PRECISELY so a test can
 * vary it for one case — see `@infrastructure/runtime/environment`. What that buys is only safe
 * with the restore: a variable left changed leaks into every later case in the file, and the case
 * that fails is not the one that changed it.
 *
 * The restore is in a `finally` and distinguishes "was unset" from "was empty": deleting a key
 * that held a value, or leaving an empty string where there was no key, are both a changed
 * environment for whatever reads it next.
 */
export const withEnvironment = async (
    key: string,
    value: string,
    body: () => Promise<void>
): Promise<void> => {
    const previous = process.env[key];
    process.env[key] = value;
    try {
        await body();
    } finally {
        if (previous === undefined) delete process.env[key];
        else process.env[key] = previous;
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
    keys: string[],
    body: () => Promise<void>
): Promise<void> => {
    const previous = new Map(keys.map((key) => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
    try {
        await body();
    } finally {
        for (const [key, value] of previous) if (value !== undefined) process.env[key] = value;
    }
};
