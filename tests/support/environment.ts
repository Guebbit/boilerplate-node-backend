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
