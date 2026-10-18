/**
 * @module
 * Reading a script's command line: `--flag value` and `--flag=value`, through `node:util`'s
 * `parseArgs` rather than a hand-rolled `indexOf`/`startsWith` at each script.
 *
 * Lenient on purpose (`strict: false`): a script ignores flags it does not know, which is what
 * `npm run x -- --flag` already does with the ones npm itself adds.
 */

import path from 'node:path';
import { parseArgs } from 'node:util';

/**
 * The value a string flag was given.
 *
 * @param flag - the flag name, without its dashes
 * @returns the value, or `undefined` when the flag is absent or has none
 */
export const flagValue = (flag: string): string | undefined => {
    // Node: https://nodejs.org/api/util.html#utilparseargsconfig — `strict: false` keeps unknown
    // flags and positionals from throwing; `args` defaults to the script's own arguments.
    const { values } = parseArgs({
        options: { [flag]: { type: 'string' } },
        strict: false,
        allowPositionals: true
    });
    const value = values[flag];
    return typeof value === 'string' ? value : undefined;
};

/**
 * A required path flag, resolved against a root. Exits 1 with a usage line when it is missing.
 *
 * @param flag - the flag name, without its dashes
 * @param root - what a relative value is resolved against
 * @returns the absolute path
 */
export const requiredPath = (flag: string, root: string): string => {
    const value = flagValue(flag);
    if (!value) {
        console.error(`Missing required argument: --${flag} <path>`);
        process.exit(1);
    }
    return path.resolve(root, value);
};
