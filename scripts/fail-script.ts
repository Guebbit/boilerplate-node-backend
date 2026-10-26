/**
 * @module
 * The last-resort handler for a script's top-level promise: say what failed and exit non-zero.
 * Its own file, with no imports, so a docs generator can use it without loading the logger, the
 * config or Mongoose the way `run-script.ts` does.
 */

/**
 * Report a script's uncaught failure and set a failing exit code.
 * Use as `main().catch(failScript)` where a script does not go through `runScript`.
 *
 * @param error - whatever the script's promise rejected with
 */
export const failScript = (error: unknown): void => {
    console.error('Script failed.', error);
    process.exitCode = 1;
};
